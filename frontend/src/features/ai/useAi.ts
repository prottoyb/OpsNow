import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth, useIsStaff } from '../auth/useAuth';
import * as api from './ai.api';

/**
 * Keys are namespaced by the signed-in user id for the same reason the
 * knowledge base's are: `GET /ai/status` answers differently per role
 * (an Employee is always told `disabled`), so two identities must never share
 * one cache entry.
 *
 * Only the status query appears here. The three task routes are deliberately
 * NOT in the query cache — see below.
 */
export const aiKeys = {
  status: (userId: string) => ['ai-status', userId] as const,
};

function useUserId(): string {
  const { user } = useAuth();
  return user?.id ?? 'anonymous';
}

/**
 * Server configuration as it applies to this caller.
 *
 * Gated on `isStaff` as well as on the caller mounting the panel behind a
 * staff check. That is redundant today and intentionally so: "an Employee
 * causes no AI request at all" is an invariant that would otherwise be
 * re-established by every future call site remembering to wrap the mount, and
 * silently lost the first time one forgot.
 */
export function useAiStatus() {
  const userId = useUserId();
  const isStaff = useIsStaff();
  return useQuery({
    queryKey: aiKeys.status(userId),
    queryFn: api.getAiStatus,
    enabled: isStaff,
    // Server configuration: it does not change within a session.
    staleTime: 5 * 60 * 1000,
  });
}

/*
 * The three task routes are mutations, not queries, and this is a safety
 * property rather than a stylistic choice.
 *
 * Each call costs money and sends ticket text to a third party, so it must
 * happen exactly when a human clicks and at no other time. A query would be
 * re-run on mount, on remount, on invalidation and on a retry; a mutation is
 * run only when something calls `mutate`, and this project's query client
 * already sets `retry: false` for mutations. The backend does not retry either
 * (ADR-023 Decision 8), so a failed call is re-attempted only by the person
 * clicking again.
 *
 * Results are held in the mutation, never written into the query cache:
 * ADR-023 Decision 11 keeps AI output unpersisted, and a draft being lost on
 * refresh is the accepted consequence of that, not a bug to paper over with a
 * cache entry.
 */

export function useAiTriage(ticketId: string) {
  return useMutation({
    mutationFn: () => api.requestTriage(ticketId),
  });
}

export function useAiDraftResponse(ticketId: string) {
  return useMutation({
    mutationFn: () => api.requestDraftResponse(ticketId),
  });
}

export function useAiResolutionSummary(ticketId: string) {
  return useMutation({
    mutationFn: () => api.requestResolutionSummary(ticketId),
  });
}
