import {
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_TTL_SECONDS,
  DEFAULT_JWT_ACCESS_EXPIRES_IN,
  DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  validateEnv,
} from './env.validation';

/**
 * The environment schema is the only thing standing between a
 * misconfigured deployment and a silently insecure one, so its failure
 * cases matter as much as its defaults: a too-short JWT secret, a
 * throttle limit of zero, or a `trust proxy` value that makes every
 * client-supplied X-Forwarded-For believable must all refuse to boot
 * rather than start and be wrong.
 */
const MINIMAL: Record<string, unknown> = {
  DATABASE_URL: 'postgresql://user:pw@localhost:5432/opsnow_dev?schema=public',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

function validate(overrides: Record<string, unknown> = {}) {
  return validateEnv({ ...MINIMAL, ...overrides });
}

describe('validateEnv', () => {
  it('accepts a minimal configuration and applies every default', () => {
    const config = validate();

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.JWT_ACCESS_EXPIRES_IN).toBe(DEFAULT_JWT_ACCESS_EXPIRES_IN);
    expect(config.REFRESH_TOKEN_TTL_SECONDS).toBe(
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    );
    expect(config.AUTH_THROTTLE_TTL_SECONDS).toBe(
      DEFAULT_AUTH_THROTTLE_TTL_SECONDS,
    );
    expect(config.AUTH_THROTTLE_LIMIT).toBe(DEFAULT_AUTH_THROTTLE_LIMIT);
    expect(config.TRUST_PROXY_HOPS).toBe(0);
  });

  it.each([
    ['DATABASE_URL', {}],
    ['JWT_ACCESS_SECRET', {}],
  ])('refuses to boot without %s', (key) => {
    const incomplete = { ...MINIMAL };
    delete incomplete[key];
    expect(() => validateEnv(incomplete)).toThrow(/Environment validation/);
  });

  it('refuses a JWT secret shorter than 32 characters', () => {
    expect(() => validate({ JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it.each([
    ['mysql://user:pw@localhost:3306/db'],
    ['not-a-url'],
    ['http://localhost:5432/opsnow'],
  ])('refuses a non-PostgreSQL DATABASE_URL (%s)', (DATABASE_URL) => {
    expect(() => validate({ DATABASE_URL })).toThrow(/DATABASE_URL/);
  });

  describe('auth throttle', () => {
    it('accepts an explicit limit and window', () => {
      const config = validate({
        AUTH_THROTTLE_LIMIT: '25',
        AUTH_THROTTLE_TTL_SECONDS: '300',
      });

      expect(config.AUTH_THROTTLE_LIMIT).toBe(25);
      expect(config.AUTH_THROTTLE_TTL_SECONDS).toBe(300);
    });

    it.each([
      ['AUTH_THROTTLE_LIMIT', '0'],
      ['AUTH_THROTTLE_LIMIT', '-1'],
      ['AUTH_THROTTLE_LIMIT', '2.5'],
      ['AUTH_THROTTLE_TTL_SECONDS', '0'],
      ['AUTH_THROTTLE_TTL_SECONDS', '-60'],
    ])('refuses %s=%s — there is no value that disables the throttle', (key, value) => {
      expect(() => validate({ [key]: value })).toThrow(new RegExp(key));
    });
  });

  describe('TRUST_PROXY_HOPS', () => {
    it('accepts a hop count', () => {
      expect(validate({ TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
    });

    it.each([
      ['true'],
      ['-1'],
      ['11'],
      ['1.5'],
    ])('refuses %s — it is a hop count, never a boolean', (TRUST_PROXY_HOPS) => {
      expect(() => validate({ TRUST_PROXY_HOPS })).toThrow(/TRUST_PROXY_HOPS/);
    });
  });

  describe('AI provider', () => {
    it('allows the mock provider outside production', () => {
      expect(() =>
        validate({ NODE_ENV: 'development', AI_PROVIDER: 'mock' }),
      ).not.toThrow();
    });

    it('refuses the mock provider in production — it fabricates output', () => {
      expect(() =>
        validate({ NODE_ENV: 'production', AI_PROVIDER: 'mock' }),
      ).toThrow(/AI_PROVIDER/);
    });

    it('stays valid with no AI configuration at all', () => {
      const config = validate();
      expect(config.AI_PROVIDER).toBeUndefined();
    });
  });

  it('reports every problem at once rather than the first', () => {
    // abortEarly: false — an operator fixing a bad deployment config should
    // not have to redeploy once per mistake.
    expect(() =>
      validate({ JWT_ACCESS_SECRET: 'short', AUTH_THROTTLE_LIMIT: '0' }),
    ).toThrow(/JWT_ACCESS_SECRET[\s\S]*AUTH_THROTTLE_LIMIT/);
  });
});
