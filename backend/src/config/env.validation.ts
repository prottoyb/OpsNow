import * as Joi from 'joi';

/** Single source of truth for defaults also referenced outside this
 * schema (e.g. AuthService/AuthController), so they can't drift apart. */
export const DEFAULT_JWT_ACCESS_EXPIRES_IN = '15m';
export const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 604800;

/** AI assistant defaults (ADR-023). The model id is the exact string from
 * Anthropic's current model guidance (the claude-api skill's model table),
 * with no date suffix; override with AI_MODEL rather than editing this. */
export const DEFAULT_AI_MODEL = 'claude-opus-5';
export const DEFAULT_AI_TIMEOUT_MS = 15000;

/**
 * Brute-force / credential-stuffing throttle for the unauthenticated auth
 * endpoints (ADR-026). Ten attempts per minute per client is far above what
 * a person fumbling a password produces and far below what an online
 * guessing attack needs to be worth running.
 */
export const DEFAULT_AUTH_THROTTLE_TTL_SECONDS = 60;
export const DEFAULT_AUTH_THROTTLE_LIMIT = 10;

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default(DEFAULT_JWT_ACCESS_EXPIRES_IN),
  REFRESH_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
  // Auth endpoint throttle (ADR-026). Configurable because the right
  // number depends on how many real users share an egress IP, not because
  // the control is optional — there is no value that switches it off.
  AUTH_THROTTLE_TTL_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(DEFAULT_AUTH_THROTTLE_TTL_SECONDS),
  AUTH_THROTTLE_LIMIT: Joi.number()
    .integer()
    .positive()
    .default(DEFAULT_AUTH_THROTTLE_LIMIT),
  /**
   * How many reverse proxies sit in front of the app, for Express'
   * `trust proxy`. It is a hop COUNT, not a boolean, on purpose: `true`
   * makes Express believe the left-most X-Forwarded-For entry, which any
   * client can forge, so a single spoofed header would both defeat the
   * auth throttle and write an attacker-chosen IP into the audit log.
   * 0 (the default) means the app is reached directly and the header is
   * ignored entirely.
   */
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),
  /**
   * Publishes the Swagger UI and its OpenAPI document at `/api/docs`
   * (ADR-027). No default here on purpose — `main.ts` supplies one that
   * depends on NODE_ENV (on outside production, off in it), which a static
   * default in this schema could not express.
   */
  SWAGGER_ENABLED: Joi.boolean().optional(),
  // AI assistant (ADR-023) — every key is optional, so validation passes
  // with none set. The mock provider fabricates output, so it is refused
  // outright in production.
  AI_PROVIDER: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid('disabled', 'anthropic'),
      otherwise: Joi.valid('disabled', 'mock', 'anthropic'),
    })
    .allow('')
    .optional(),
  AI_API_KEY: Joi.string().allow('').optional(),
  AI_MODEL: Joi.string().default(DEFAULT_AI_MODEL),
  AI_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(120000)
    .default(DEFAULT_AI_TIMEOUT_MS),
}).unknown(true);

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  // `schema` is a Joi.ObjectSchema<any>, so `validate` is typed as
  // returning ValidationResult<any> no matter what the schema actually
  // describes. The shape is guaranteed by the schema above and asserted
  // on the way out; there is no narrower type Joi can give us here.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { error, value } = schema.validate(config, { abortEarly: false });

  if (error) {
    throw new Error(`Environment validation failed: ${error.message}`);
  }

  return value as Record<string, unknown>;
}
