import { AiGenerateResult, AiMode, AiPrompt, AiProvider, AiProviderError } from '../ai.types';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type FetchFn = typeof fetch;

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Injected in tests; production uses the global fetch. */
  fetchFn?: FetchFn;
  url?: string;
}

interface AnthropicMessageBody {
  content?: { type?: string; text?: unknown }[];
  model?: unknown;
  stop_reason?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
}

/**
 * The live adapter (ADR-023 Decision 4): plain `fetch` + AbortController, no
 * SDK, no retries. It is the ONLY file that knows the vendor's wire format or
 * holds the key, and it is only constructed when a key is present.
 *
 * Every failure is mapped to our own AiFailureReason and the vendor's
 * message, body and cause are DISCARDED here: vendor errors echo fragments of
 * the request back, and the request contains ticket text and the key.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly mode: AiMode = 'anthropic';

  private readonly fetchFn: FetchFn;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async generate(prompt: AiPrompt): Promise<AiGenerateResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetchFn(this.options.url ?? ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.options.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          // A redirect would forward the key header to another origin.
          redirect: 'error',
          signal: controller.signal,
          body: JSON.stringify({
            model: this.options.model,
            max_tokens: prompt.maxTokens,
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.user }],
          }),
        });
      } catch (error) {
        throw new AiProviderError(isAbort(error) ? 'timeout' : 'provider_error');
      }

      if (!response.ok) {
        throw new AiProviderError(mapStatus(response.status));
      }

      let body: AnthropicMessageBody;
      try {
        body = (await response.json()) as AnthropicMessageBody;
      } catch (error) {
        throw new AiProviderError(isAbort(error) ? 'timeout' : 'provider_error');
      }

      return this.toResult(body);
    } finally {
      clearTimeout(timer);
    }
  }

  private toResult(body: AnthropicMessageBody): AiGenerateResult {
    if (body.stop_reason === 'refusal' || !Array.isArray(body.content)) {
      throw new AiProviderError('provider_error');
    }

    // Thinking (and any other non-text) blocks are ignored: only text is
    // ever treated as the completion.
    const text = body.content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');

    if (text.length === 0) {
      throw new AiProviderError('provider_error');
    }

    return {
      text,
      model: typeof body.model === 'string' ? body.model : this.options.model,
      inputTokens: asCount(body.usage?.input_tokens),
      outputTokens: asCount(body.usage?.output_tokens),
    };
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function asCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 429 and 529 (overloaded) are "back off" conditions; 408/504 are timeouts;
 * everything else — including 401/403 (a bad key) — is a generic provider
 * error, deliberately not distinguished to the client. */
function mapStatus(status: number): 'rate_limited' | 'timeout' | 'provider_error' {
  if (status === 429 || status === 529) {
    return 'rate_limited';
  }
  if (status === 408 || status === 504) {
    return 'timeout';
  }
  return 'provider_error';
}
