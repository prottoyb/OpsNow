import { LogLevel } from '@nestjs/common';

/**
 * The two production-exposure decisions `bootstrap()` makes, extracted so
 * they can be tested (ADR-027). Importing `main.ts` would run `bootstrap()`,
 * which needs an application and a database, so a policy written inline
 * there is a policy that is never verified.
 */

/**
 * `debug` and `verbose` are dropped in production. They are noise at volume,
 * they cost money in a log pipeline, and — the reason that actually matters —
 * they are the levels most likely to carry request detail that was never
 * reviewed for what it discloses.
 */
const PRODUCTION_LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log'];
const DEFAULT_LOG_LEVELS: LogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

export function resolveLogLevels(nodeEnv: string | undefined): LogLevel[] {
  return nodeEnv === 'production'
    ? [...PRODUCTION_LOG_LEVELS]
    : [...DEFAULT_LOG_LEVELS];
}

/**
 * Swagger is off by default in production and on by default everywhere else.
 *
 * The generated document is a complete, machine-readable description of
 * every route, role gate, parameter and response shape, and `/api/docs` has
 * no authentication in front of it. Publishing that is a deliberate choice,
 * so it is opt-in rather than something a deployment must remember to turn
 * off. An explicit `SWAGGER_ENABLED` wins in either direction.
 */
export function resolveSwaggerEnabled(
  nodeEnv: string | undefined,
  configured: boolean | undefined,
): boolean {
  if (configured !== undefined) {
    return configured;
  }
  return nodeEnv !== 'production';
}
