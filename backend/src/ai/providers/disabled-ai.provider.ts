import { AiGenerateResult, AiMode, AiProvider, AiProviderError } from '../ai.types';

/**
 * The default when no key is configured (ADR-023 Decision 3). It always
 * fails: an unconfigured install must be honest that the feature is off, not
 * hand a support agent plausible-looking fabricated advice.
 */
export class DisabledAiProvider implements AiProvider {
  readonly mode: AiMode = 'disabled';

  generate(): Promise<AiGenerateResult> {
    return Promise.reject(new AiProviderError('disabled'));
  }
}
