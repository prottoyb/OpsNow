import * as Joi from 'joi';

/** Single source of truth for defaults also referenced outside this
 * schema (e.g. AuthService/AuthController), so they can't drift apart. */
export const DEFAULT_JWT_ACCESS_EXPIRES_IN = '15m';
export const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 604800;

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
