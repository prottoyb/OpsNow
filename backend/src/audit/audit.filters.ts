import { Prisma } from '@prisma/client';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Builds the WHERE clause for the audit list. Pure, so it is unit-testable
 * without a database. Every filter is an exact match (or an inclusive date
 * bound) combined with AND — a filter can only narrow, never widen.
 *
 * `outcome` lives in the JSON `metadata` (the model has no outcome column),
 * so it is a JSON-path equality.
 */
export function buildAuditWhere(
  query: Pick<
    ListAuditLogsQueryDto,
    'actorId' | 'action' | 'entityType' | 'entityId' | 'outcome' | 'from' | 'to'
  >,
): Prisma.AuditLogWhereInput {
  const clauses: Prisma.AuditLogWhereInput[] = [];

  if (query.actorId) clauses.push({ actorId: query.actorId });
  if (query.action) clauses.push({ action: query.action });
  if (query.entityType) clauses.push({ entityType: query.entityType });
  if (query.entityId) clauses.push({ entityId: query.entityId });
  if (query.outcome) {
    clauses.push({ metadata: { path: ['outcome'], equals: query.outcome } });
  }
  if (query.from || query.to) {
    clauses.push({
      createdAt: {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      },
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}
