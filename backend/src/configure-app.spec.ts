import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configureApp } from './configure-app';

/**
 * `configureApp` is the one place where main.ts and the e2e bootstrap agree
 * on how the HTTP layer is set up, so a change here silently changes what
 * every e2e test is actually testing. The `trust proxy` assertions matter
 * most: that value decides what `req.ip` means, and `req.ip` is both what
 * the auth throttle counts against (ADR-026) and what is written into every
 * audit row (ADR-025).
 */
function buildApp(configValues: Record<string, unknown> = {}) {
  const expressSet = jest.fn();
  const configGet = jest.fn(
    (key: string, defaultValue?: unknown) =>
      key in configValues ? configValues[key] : defaultValue,
  );

  const app = {
    get: jest.fn((token: unknown) => {
      if (token === ConfigService) {
        return { get: configGet } as unknown as ConfigService;
      }
      throw new Error(`Unexpected injection token requested: ${String(token)}`);
    }),
    getHttpAdapter: jest.fn(() => ({
      getInstance: () => ({ set: expressSet }),
    })),
    use: jest.fn(),
    setGlobalPrefix: jest.fn(),
    enableVersioning: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
  };

  return { app: app as unknown as INestApplication, expressSet, configGet };
}

describe('configureApp', () => {
  it('mounts the API under /api with URI versioning defaulting to v1', () => {
    const { app } = buildApp();
    configureApp(app);

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(app.enableVersioning).toHaveBeenCalledWith({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
  });

  it('installs a whitelisting, transforming validation pipe', () => {
    const { app } = buildApp();
    configureApp(app);

    const pipe = (app.useGlobalPipes as jest.Mock).mock.calls[0][0] as unknown;
    expect(pipe).toBeInstanceOf(ValidationPipe);
    // forbidNonWhitelisted is what turns an unexpected body property into a
    // 400 instead of it being quietly dropped, which several DTO contracts
    // (and their tests) depend on.
    expect(pipe).toMatchObject({
      validatorOptions: expect.objectContaining({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    });
  });

  it('installs the exception filter that keeps internal errors generic', () => {
    const { app } = buildApp();
    configureApp(app);

    expect(
      (app.useGlobalFilters as jest.Mock).mock.calls[0][0],
    ).toBeInstanceOf(AllExceptionsFilter);
  });

  describe('trust proxy', () => {
    it('trusts nothing by default, so a forged X-Forwarded-For is ignored', () => {
      const { app, expressSet } = buildApp();
      configureApp(app);

      expect(expressSet).toHaveBeenCalledWith('trust proxy', 0);
    });

    it('trusts exactly the configured number of hops', () => {
      const { app, expressSet } = buildApp({ TRUST_PROXY_HOPS: 2 });
      configureApp(app);

      expect(expressSet).toHaveBeenCalledWith('trust proxy', 2);
    });

    it('never passes Express the boolean true', () => {
      // `true` makes Express believe the left-most X-Forwarded-For entry,
      // which any client can set. A hop count takes the n-th address from
      // the right instead — the one a proxy the operator controls appended.
      for (const hops of [0, 1, 5]) {
        const { app, expressSet } = buildApp({ TRUST_PROXY_HOPS: hops });
        configureApp(app);

        const value = expressSet.mock.calls.find(
          (call) => call[0] === 'trust proxy',
        )?.[1];
        expect(typeof value).toBe('number');
      }
    });
  });
});
