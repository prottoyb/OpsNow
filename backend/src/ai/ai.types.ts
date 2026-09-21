/**
 * The narrow provider boundary (ADR-023 Decision 2). A provider is a
 * TRANSPORT: it takes a finished prompt and returns the model's raw text.
 * Prompt assembly, parsing, grounding and validation all live above it, in
 * vendor-neutral modules, so the safety code is the same for every provider
 * and is exercised by tests against a fake transport.
 */

export type AiMode = 'disabled' | 'mock' | 'anthropic';

export type AiTask = 'triage' | 'draft_response' | 'resolution_summary';

/** Why an AI call failed. Surfaced to the client as `reason` on a 503. */
export type AiFailureReason =
  | 'disabled'
  | 'timeout'
  | 'rate_limited'
  | 'provider_error'
  | 'invalid_output'
  | 'busy';

export interface AiPrompt {
  task: AiTask;
  system: string;
  user: string;
  maxTokens: number;
}

export interface AiGenerateResult {
  text: string;
  /** Model id the provider reports having used. */
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiProvider {
  readonly mode: AiMode;
  generate(prompt: AiPrompt): Promise<AiGenerateResult>;
}

/** DI token for the resolved provider. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

/**
 * Carries a REASON and nothing else. Vendor error messages, response bodies
 * and causes routinely echo fragments of the request (i.e. ticket text or
 * the key) back, so adapters discard them at their boundary and throw this.
 */
export class AiProviderError extends Error {
  constructor(readonly reason: AiFailureReason) {
    super(`AI provider failure: ${reason}`);
    this.name = 'AiProviderError';
  }
}
