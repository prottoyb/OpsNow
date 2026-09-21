import { AiPrompt, AiProviderError } from '../ai.types';
import { AnthropicAiProvider, ANTHROPIC_MESSAGES_URL } from './anthropic-ai.provider';

// Every test injects a STUB fetch. The real one is never reachable from here.
const KEY = 'sk-test-SENTINEL-KEY';
const prompt: AiPrompt = {
  task: 'triage',
  system: 'sys SENTINEL-SYSTEM',
  user: 'user SENTINEL-USER',
  maxTokens: 123,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function make(fetchFn: jest.Mock, timeoutMs = 1000) {
  return new AnthropicAiProvider({
    apiKey: KEY,
    model: 'test-model',
    timeoutMs,
    fetchFn: fetchFn,
  });
}

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    return error as AiProviderError;
  }
  throw new Error('expected a failure');
}

describe('AnthropicAiProvider', () => {
  it('sends the documented request and returns the text blocks only', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse({
        model: 'reported-model',
        content: [
          { type: 'thinking', thinking: 'ignored' },
          { type: 'text', text: '{"a":' },
          { type: 'text', text: '1}' },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );

    const result = await make(fetchFn).generate(prompt);

    expect(result).toEqual({
      text: '{"a":1}',
      model: 'reported-model',
      inputTokens: 10,
      outputTokens: 5,
    });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(KEY);
    expect(headers['anthropic-version']).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: 'test-model',
      max_tokens: 123,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    });
    // The key travels in a header only.
    expect(init.body as string).not.toContain(KEY);
  });

  it.each([
    [429, 'rate_limited'],
    [529, 'rate_limited'],
    [408, 'timeout'],
    [504, 'timeout'],
    [400, 'provider_error'],
    [401, 'provider_error'],
    [403, 'provider_error'],
    [500, 'provider_error'],
    [503, 'provider_error'],
  ])('maps HTTP %i to %s', async (status, reason) => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'echo SENTINEL-USER' } }, status));
    const error = await failureOf(make(fetchFn).generate(prompt));
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.reason).toBe(reason);
  });

  it('discards the vendor message, body and cause on every failure path', async () => {
    const cases: jest.Mock[] = [
      jest.fn().mockResolvedValue(jsonResponse({ error: { message: `echo ${KEY} SENTINEL-USER` } }, 400)),
      jest.fn().mockRejectedValue(new Error(`socket said ${KEY} SENTINEL-USER`)),
      jest.fn().mockResolvedValue(new Response('not json SENTINEL-USER', { status: 200 })),
      jest.fn().mockResolvedValue(jsonResponse({ content: [] })),
    ];
    for (const fetchFn of cases) {
      const error = await failureOf(make(fetchFn).generate(prompt));
      const dump = JSON.stringify({ m: error.message, s: error.stack, c: (error as { cause?: unknown }).cause });
      expect(error.cause).toBeUndefined();
      expect(dump).not.toContain('SENTINEL');
      expect(dump).not.toContain(KEY);
      expect(error.reason).toBe('provider_error');
    }
  });

  it('treats a refusal or an empty completion as a provider error', async () => {
    const refusal = jest
      .fn()
      .mockResolvedValue(jsonResponse({ stop_reason: 'refusal', content: [{ type: 'text', text: 'no' }] }));
    expect((await failureOf(make(refusal).generate(prompt))).reason).toBe('provider_error');
  });

  it('aborts a slow request and reports a timeout', async () => {
    const fetchFn = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abort = new Error('aborted SENTINEL-USER');
            abort.name = 'AbortError';
            reject(abort);
          });
        }),
    );
    const error = await failureOf(make(fetchFn, 20).generate(prompt));
    expect(error.reason).toBe('timeout');
    expect(error.message).not.toContain('SENTINEL');
  });

  it('does not retry', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}, 429));
    await failureOf(make(fetchFn).generate(prompt));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
