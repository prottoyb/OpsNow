import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Applies the application-wide HTTP configuration (proxy trust, prefix,
 * versioning, validation, error handling). Shared between `main.ts` and
 * the e2e test bootstrap so the two can never drift apart.
 */
export function configureApp(app: INestApplication): void {
  configureProxyTrust(app);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
}

/**
 * Tells Express how many reverse proxies to believe when deriving `req.ip`
 * from `X-Forwarded-For`.
 *
 * This is a security control, not a convenience. `req.ip` is what the auth
 * throttle counts against (ADR-026) and what every audit row records
 * (ADR-025), so getting it wrong fails in one of two directions:
 *
 *  - Too low (the default 0, i.e. no trust) behind a proxy: every request
 *    appears to come from the proxy's address. One attacker then exhausts
 *    the login throttle for every legitimate user at once, and the audit
 *    log records the proxy for everything.
 *  - Too high, or Express' `true`: the left-most X-Forwarded-For entry is
 *    believed, and a client can put anything there — so an attacker gets
 *    a fresh throttle bucket per forged header and writes a chosen IP
 *    into the audit log.
 *
 * A hop COUNT avoids both: Express takes the n-th address from the right,
 * which is the one the outermost proxy the operator actually controls
 * appended. Set TRUST_PROXY_HOPS to the number of proxies in front of
 * this process (see backend/.env.example and docs/deployment.md).
 */
function configureProxyTrust(app: INestApplication): void {
  const hops = app.get(ConfigService).get<number>('TRUST_PROXY_HOPS', 0);
  app.getHttpAdapter().getInstance().set('trust proxy', hops);
}
