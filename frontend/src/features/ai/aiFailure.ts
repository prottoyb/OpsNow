import { toApiError } from '../../lib/api/errors';
import { AI_FAILURE_REASONS } from '../../types/api';
import type { AiFailureReason } from '../../types/api';

/**
 * Turning an AI failure into something a support agent can act on.
 *
 * The backend answers every AI failure with
 * `{ statusCode: 503, code: 'AI_UNAVAILABLE', reason, message }` and never
 * retries (ADR-023 Decision 8) — the human clicks again. So the copy below is
 * written to tell the reader which of those two things to do: wait and retry,
 * or stop because nothing is configured.
 *
 * Reading the reason takes one deliberate detour. `ApiError.fromResponse`
 * replaces the body of ANY response with status >= 500 with a generic message,
 * on purpose, so that no server internals reach the UI — but it keeps the
 * parsed body on `.raw`. The reason therefore has to be read off `.raw`, and
 * every step of that read has to be defensive, because `.raw` is by definition
 * a value we have decided not to trust.
 */

/**
 * The `code` discriminator, not merely the status. A 503 can also come from a
 * proxy, a load balancer or a future non-AI route, and rendering "the AI
 * assistant is rate limited" over a gateway error would be a lie.
 */
const AI_UNAVAILABLE_CODE = 'AI_UNAVAILABLE';

/**
 * Exhaustive by type, not by convention: `Record<AiFailureReason, string>`
 * means adding a reason to the closed list fails the build here until copy
 * exists for it. `features/ai/aiFailure.test.ts` additionally checks the list
 * itself still matches the backend's union.
 */
const REASON_MESSAGES: Record<AiFailureReason, string> = {
  disabled: 'The AI assistant is not configured on this server.',
  timeout: 'The AI assistant took too long to respond. Try again.',
  rate_limited:
    'The AI assistant is rate limited right now. Wait a moment and try again.',
  provider_error: 'The AI provider could not be reached. Try again.',
  invalid_output:
    'The AI assistant returned a response we could not use. Try again.',
  busy: 'The AI assistant is handling too many requests right now. Try again in a moment.',
};

/** Used when the assistant fails in a way that carries no recognised reason. */
const UNKNOWN_FAILURE_MESSAGE =
  'The AI assistant is unavailable right now. Try again.';

function isFailureReason(value: unknown): value is AiFailureReason {
  return (
    typeof value === 'string' &&
    (AI_FAILURE_REASONS as readonly string[]).includes(value)
  );
}

/**
 * The reason from an `AI_UNAVAILABLE` 503, or null for anything else —
 * including a 503 that is not ours and a 503 whose reason is absent or is a
 * string we do not recognise. A caller must treat null as "some other
 * failure", never as "no failure".
 */
export function aiFailureReason(error: unknown): AiFailureReason | null {
  const apiError = toApiError(error);
  if (apiError.status !== 503) {
    return null;
  }

  const body = apiError.raw;
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const { code, reason } = body as { code?: unknown; reason?: unknown };
  if (code !== AI_UNAVAILABLE_CODE) {
    return null;
  }

  return isFailureReason(reason) ? reason : null;
}

/** True for any 503 the backend labelled `AI_UNAVAILABLE`, recognised reason
 * or not — so an unknown reason still gets assistant-shaped copy rather than
 * the client's generic 5xx message. */
export function isAiUnavailable(error: unknown): boolean {
  const apiError = toApiError(error);
  if (apiError.status !== 503) {
    return false;
  }
  const body = apiError.raw;
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === AI_UNAVAILABLE_CODE
  );
}

/** The user-facing copy for one reason. Exported for the drift guard. */
export function aiFailureMessage(reason: AiFailureReason): string {
  return REASON_MESSAGES[reason];
}

/**
 * Display messages for anything an AI call threw.
 *
 * An `AI_UNAVAILABLE` 503 gets its reason-specific copy; everything else — a
 * 404 for a ticket outside the caller's scope, a 403, a 400 for a malformed
 * id, a transport failure — falls through to the same `toApiError` path every
 * other feature in this application uses, so those failures read identically
 * here and elsewhere.
 */
export function aiErrorMessages(error: unknown): string[] {
  if (isAiUnavailable(error)) {
    const reason = aiFailureReason(error);
    return [reason ? REASON_MESSAGES[reason] : UNKNOWN_FAILURE_MESSAGE];
  }
  return toApiError(error).messages;
}
