import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListAuditLogsQuery } from '../../types/api';
import { isAuditReadRole } from '../../types/api';
import { useAuth } from '../auth/useAuth';
import * as api from './audit.api';

/**
 * Namespaced by the signed-in user id like every other feature's keys, so two
 * identities never share a cache entry. The full query is part of the key, so
 * a filter or page change is a new entry and a refetch.
 */
export const auditKeys = {
  list: (userId: string, query: ListAuditLogsQuery) =>
    ['audit', userId, 'list', query] as const,
};

/**
 * True for Administrator only. Decides whether the audit log is OFFERED (nav
 * entry, route); the backend's `@Roles(...AUDIT_READ_ROLES)` guard is what
 * actually enforces it.
 */
export function useCanViewAudit(): boolean {
  const { user } = useAuth();
  return user ? isAuditReadRole(user.role) : false;
}

/**
 * `enabled` is also gated on the role, so a non-Administrator can never fire
 * the request even if the hook is mounted. `keepPreviousData` keeps the last
 * page on screen while a changed filter loads.
 */
export function useAuditLogs(query: ListAuditLogsQuery, enabled: boolean) {
  const { user } = useAuth();
  const canView = useCanViewAudit();
  return useQuery({
    queryKey: auditKeys.list(user?.id ?? 'anonymous', query),
    queryFn: () => api.listAuditLogs(query),
    enabled: enabled && canView,
    placeholderData: keepPreviousData,
  });
}
