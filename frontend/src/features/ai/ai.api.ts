import { apiFetch } from '../../lib/api/client';
import type {
  AiDraftResponse,
  AiResolutionSummary,
  AiStatus,
  AiTriage,
} from '../../types/api';

/*
 * Read-only against the ticket, by construction: none of these routes mutates
 * anything (DECISIONS.md ADR-023 Decision 5), and there is deliberately no
 * "apply this suggestion" call to write here — applying a suggestion goes
 * through the ordinary ticket update API, which does its own validation, role
 * checks, SLA recalculation and history write.
 *
 * The three task routes are POST returning 200 rather than GET because they
 * cost money and call a third party, so they must never be fired by a cache
 * refetch, a prefetch or a retry. They are wired up as mutations in `useAi.ts`
 * for exactly that reason.
 */

export function getAiStatus(): Promise<AiStatus> {
  return apiFetch<AiStatus>('/ai/status');
}

export function requestTriage(ticketId: string): Promise<AiTriage> {
  return apiFetch<AiTriage>(`/tickets/${ticketId}/ai/triage`, {
    method: 'POST',
  });
}

export function requestDraftResponse(
  ticketId: string,
): Promise<AiDraftResponse> {
  return apiFetch<AiDraftResponse>(`/tickets/${ticketId}/ai/draft-response`, {
    method: 'POST',
  });
}

export function requestResolutionSummary(
  ticketId: string,
): Promise<AiResolutionSummary> {
  return apiFetch<AiResolutionSummary>(
    `/tickets/${ticketId}/ai/resolution-summary`,
    { method: 'POST' },
  );
}
