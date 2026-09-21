import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api/errors';
import { AI_FAILURE_REASONS, AI_MODES } from '../../types/api';
import { aiErrorMessages, aiFailureMessage, aiFailureReason, isAiUnavailable } from './aiFailure';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_AI_TYPES = join(HERE, '../../../../backend/src/ai/ai.types.ts');

/**
 * The frontend is a separate package and cannot import the backend's types,
 * so `types/api.ts` carries a mirror of the closed reason and mode lists.
 * This is what stops the mirror drifting: it parses the backend source
 * (read-only) and compares.
 *
 * It deliberately does NOT reuse `auditActions.test.ts`'s `block()` helper —
 * that one reads to a closing brace at column zero, which suits a const object
 * or an enum. These are plain `|`-unions terminated by a semicolon.
 */
describe('AI constants mirror the backend', () => {
  it('finds the backend AI types file', () => {
    expect(existsSync(BACKEND_AI_TYPES)).toBe(true);
  });

  const source = existsSync(BACKEND_AI_TYPES)
    ? readFileSync(BACKEND_AI_TYPES, 'utf8')
    : '';

  /** The quoted members of `export type <name> = 'a' | 'b' | ...;`. */
  function unionMembers(name: string): string[] {
    const match = new RegExp(`export type ${name}\\s*=([^;]*);`).exec(source);
    if (!match) throw new Error(`Backend ai.types.ts: ${name} not found`);
    return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it('has the same closed failure-reason list, in the same order', () => {
    const reasons = unionMembers('AiFailureReason');
    expect(reasons.length).toBeGreaterThan(0);
    expect([...AI_FAILURE_REASONS]).toEqual(reasons);
  });

  it('has the same modes, in the same order', () => {
    expect([...AI_MODES]).toEqual(unionMembers('AiMode'));
  });

  it('carries the AI_UNAVAILABLE code the client discriminates on', () => {
    const errors = readFileSync(join(HERE, '../../../../backend/src/ai/ai.errors.ts'), 'utf8');
    expect(errors).toContain("code: 'AI_UNAVAILABLE'");
  });

  it('has user-facing copy for every reason', () => {
    for (const reason of AI_FAILURE_REASONS) {
      expect(aiFailureMessage(reason).trim()).not.toBe('');
    }
  });
});

/** Builds the error the API client actually produces for an AI 503: the
 * generic message, with the parsed body preserved on `raw`. */
function aiError(body: unknown): ApiError {
  return ApiError.fromResponse(503, body);
}

describe('aiFailureReason', () => {
  it('reads the reason off the body the client kept on `raw`', () => {
    // Proves the detour is necessary as well as sufficient: the displayable
    // message has already been replaced by the generic 5xx text.
    const error = aiError({ code: 'AI_UNAVAILABLE', reason: 'rate_limited' });
    expect(error.messages[0]).not.toMatch(/rate limited/i);
    expect(aiFailureReason(error)).toBe('rate_limited');
  });

  it('ignores a 503 that is not the assistant', () => {
    expect(aiFailureReason(aiError({ message: 'Bad gateway' }))).toBeNull();
    expect(aiFailureReason(aiError({ code: 'SOMETHING_ELSE', reason: 'busy' }))).toBeNull();
  });

  it('ignores a non-503', () => {
    expect(
      aiFailureReason(
        ApiError.fromResponse(404, { statusCode: 404, message: 'Ticket not found' }),
      ),
    ).toBeNull();
  });

  it('returns null for a reason outside the closed list', () => {
    expect(aiFailureReason(aiError({ code: 'AI_UNAVAILABLE', reason: 'meltdown' }))).toBeNull();
  });

  it('survives a body of any shape', () => {
    for (const body of [null, undefined, 'a string', 42, [], { code: 42 }]) {
      expect(() => aiFailureReason(aiError(body))).not.toThrow();
      expect(aiFailureReason(aiError(body))).toBeNull();
    }
  });

  it('is not fooled by a non-ApiError throw', () => {
    expect(aiFailureReason(new Error('boom'))).toBeNull();
    expect(aiFailureReason(undefined)).toBeNull();
  });
});

describe('aiErrorMessages', () => {
  it('gives reason-specific copy for each recognised reason', () => {
    for (const reason of AI_FAILURE_REASONS) {
      expect(aiErrorMessages(aiError({ code: 'AI_UNAVAILABLE', reason }))).toEqual([
        aiFailureMessage(reason),
      ]);
    }
  });

  it('still reads as an assistant failure when the reason is unrecognised', () => {
    const messages = aiErrorMessages(aiError({ code: 'AI_UNAVAILABLE', reason: 'meltdown' }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/AI assistant is unavailable/i);
    // Never the raw reason: it is an unvalidated string from the server.
    expect(messages[0]).not.toContain('meltdown');
  });

  it('falls through to the ordinary API error path for anything else', () => {
    const notFound = ApiError.fromResponse(404, {
      statusCode: 404,
      message: 'Ticket not found',
    });
    expect(aiErrorMessages(notFound)).toEqual(['Ticket not found']);
    expect(isAiUnavailable(notFound)).toBe(false);
  });
});
