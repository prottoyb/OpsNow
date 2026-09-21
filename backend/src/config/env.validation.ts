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
  const { error, value } = schema.validate(config, { abortEarly: false });

  if (error) {
    throw new Error(`Environment validation failed: ${error.message}`);
  }

  return value as Record<string, unknown>;
}
