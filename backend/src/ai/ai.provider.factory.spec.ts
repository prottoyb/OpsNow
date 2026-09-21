import { validateEnv } from '../config/env.validation';
import { createAiProvider, resolveAiMode } from './ai.provider.factory';
import { AiProviderError } from './ai.types';
import { AnthropicAiProvider } from './providers/anthropic-ai.provider';
import { DisabledAiProvider } from './providers/disabled-ai.provider';
import { MockAiProvider } from './providers/mock-ai.provider';

const base = { model: 'm', timeoutMs: 1000 };

describe('provider selection', () => {
  it.each([
    ['nothing configured', undefined, undefined, 'disabled'],
    ['empty strings', '', '', 'disabled'],
    ['blank key', undefined, '   ', 'disabled'],
    ['explicit disabled with a key', 'disabled', 'k', 'disabled'],
    ['live requested but keyless', 'anthropic', undefined, 'disabled'],
    ['live requested with an empty key', 'anthropic', '', 'disabled'],
    ['unknown provider name with a key', 'other', 'k', 'disabled'],
    ['explicit mock', 'mock', undefined, 'mock'],
    ['mock wins over a key', 'mock', 'k', 'mock'],
    ['a key alone selects live', undefined, 'k', 'anthropic'],
    ['live with a key', 'anthropic', 'k', 'anthropic'],
  ])('%s -> %s', (_name, provider, key, expected) => {
    expect(resolveAiMode(provider, key)).toBe(expected);
  });

  it('never resolves a missing key to mock', () => {
    for (const provider of [undefined, '', 'disabled', 'anthropic']) {
      expect(resolveAiMode(provider, undefined)).not.toBe('mock');
    }
  });

  it('constructs the provider matching the mode', () => {
    expect(createAiProvider({ ...base })).toBeInstanceOf(DisabledAiProvider);
    expect(createAiProvider({ ...base, provider: 'mock' })).toBeInstanceOf(MockAiProvider);
    expect(createAiProvider({ ...base, provider: 'anthropic' })).toBeInstanceOf(DisabledAiProvider);
    expect(createAiProvider({ ...base, apiKey: 'k' }, jest.fn())).toBeInstanceOf(
      AnthropicAiProvider,
    );
  });

  it('never touches fetch unless the live adapter is selected and called', () => {
    const fetchFn = jest.fn();
    createAiProvider({ ...base }, fetchFn);
    createAiProvider({ ...base, provider: 'anthropic' }, fetchFn);
    createAiProvider({ ...base, provider: 'mock' }, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('the disabled provider always fails with reason disabled', async () => {
    await expect(new DisabledAiProvider().generate()).rejects.toMatchObject({
      reason: 'disabled',
    });
    await expect(new DisabledAiProvider().generate()).rejects.toBeInstanceOf(AiProviderError);
  });
});

describe('AI environment validation', () => {
  const env = {
    DATABASE_URL: 'postgresql://u@localhost:5432/db',
    JWT_ACCESS_SECRET: 'x'.repeat(40),
  };

  it('passes with no AI variables and applies defaults', () => {
    const out = validateEnv(env);
    expect(out.AI_MODEL).toBe('claude-opus-5');
    expect(out.AI_TIMEOUT_MS).toBe(15000);
  });

  it('accepts mock outside production', () => {
    expect(() => validateEnv({ ...env, NODE_ENV: 'development', AI_PROVIDER: 'mock' })).not.toThrow();
  });

  it('rejects mock in production', () => {
    expect(() => validateEnv({ ...env, NODE_ENV: 'production', AI_PROVIDER: 'mock' })).toThrow(
      /AI_PROVIDER/,
    );
  });

  it('accepts the live provider and empty values in production', () => {
    expect(() =>
      validateEnv({ ...env, NODE_ENV: 'production', AI_PROVIDER: 'anthropic', AI_API_KEY: 'k' }),
    ).not.toThrow();
    expect(() =>
      validateEnv({ ...env, NODE_ENV: 'production', AI_PROVIDER: '', AI_API_KEY: '' }),
    ).not.toThrow();
  });

  it('rejects an unknown provider and an absurd timeout', () => {
    expect(() => validateEnv({ ...env, AI_PROVIDER: 'gpt' })).toThrow();
    expect(() => validateEnv({ ...env, AI_TIMEOUT_MS: 5 })).toThrow();
  });
});
