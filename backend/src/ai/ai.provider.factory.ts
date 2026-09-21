import { AiMode, AiProvider } from './ai.types';
import { AnthropicAiProvider, FetchFn } from './providers/anthropic-ai.provider';
import { DisabledAiProvider } from './providers/disabled-ai.provider';
import { MockAiProvider } from './providers/mock-ai.provider';

export interface AiSettings {
  provider?: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

/**
 * Resolves the mode from configuration (ADR-023 Decision 3):
 *  - `mock` only when explicitly requested (Joi refuses it in production);
 *  - the live provider only when a NON-EMPTY key exists and the provider is
 *    either unset or `anthropic`;
 *  - everything else — no key, `disabled`, or live requested without a key —
 *    is `disabled`, never `mock`.
 */
export function resolveAiMode(provider: string | undefined, apiKey: string | undefined): AiMode {
  const requested = provider?.trim() ?? '';
  if (requested === 'mock') {
    return 'mock';
  }
  const hasKey = (apiKey?.trim() ?? '').length > 0;
  if (hasKey && (requested === '' || requested === 'anthropic')) {
    return 'anthropic';
  }
  return 'disabled';
}

/** The live adapter is never constructed unless the mode is `anthropic`,
 * which requires a key: an unconfigured build cannot reach the network. */
export function createAiProvider(settings: AiSettings, fetchFn?: FetchFn): AiProvider {
  switch (resolveAiMode(settings.provider, settings.apiKey)) {
    case 'mock':
      return new MockAiProvider();
    case 'anthropic':
      return new AnthropicAiProvider({
        apiKey: (settings.apiKey as string).trim(),
        model: settings.model,
        timeoutMs: settings.timeoutMs,
        fetchFn,
      });
    default:
      return new DisabledAiProvider();
  }
}
