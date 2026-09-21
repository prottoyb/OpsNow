import { apiFetch } from '../../lib/api/client';
import type { AuditLogList, ListAuditLogsQuery } from '../../types/api';

/*
 * Read-only by design: the audit log is append-only, so there is no update or
 * delete call to write here, and none may be added. Administrator-only on the
 * backend; any other role receives 403.
 */
export function listAuditLogs(query: ListAuditLogsQuery): Promise<AuditLogList> {
  return apiFetch<AuditLogList>('/audit-logs', { query: { ...query } });
}
