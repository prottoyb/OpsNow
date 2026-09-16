import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import * as api from './sla.api';

/**
 * Namespaced by signed-in user id for the same reason ticket keys are
 * (`useTickets.ts`): what an endpoint returns depends on who is asking, and
 * two identities must never share one cache entry.
 */
export const slaKeys = {
  policies: (userId: string) => ['sla', userId, 'policies'] as const,
  metrics: (userId: string) => ['sla', userId, 'metrics'] as const,
};

function useUserId(): string {
  const { user } = useAuth();
  return user?.id ?? 'anonymous';
}

/**
 * Both endpoints are staff-only. `enabled` keeps a non-staff browser from
 * ever issuing a request that could only come back 403 — a UI nicety, not
 * the access control, which lives in `SlaController`'s `@Roles()` guard and
 * again in `SlaService.assertStaff()`. Mirrors the existing
 * `useTicketHistory(ticketId, isStaff)` pattern.
 */
export function useSlaPolicies(enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: slaKeys.policies(userId),
    queryFn: api.listSlaPolicies,
    enabled,
    // Policies are effectively static within a session.
    staleTime: 5 * 60 * 1000,
  });
}

export function useSlaMetrics(enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: slaKeys.metrics(userId),
    queryFn: api.getSlaMetrics,
    enabled,
  });
}
