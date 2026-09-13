import * as Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
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
