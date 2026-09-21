import { Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

/**
 * Per-row ticket visibility scoping (see DECISIONS.md ADR-019): an Employee
 * may only see their own tickets; staff may see any (non-soft-deleted)
 * ticket.
 *
 * Extracted out of TicketsService so SlaService can build every SLA query's
 * `where` from the same rule (Phase 7 / ADR-020) without importing
 * TicketsService itself — the dependency direction is `tickets -> sla`
 * only, so a shared, service-free helper is what lets scoping travel to
 * SLA metrics if the role gate on those routes is ever loosened.
 */
export function ticketVisibilityWhere(
  user: AuthenticatedUser,
): Prisma.TicketWhereInput {
  return {
    deletedAt: null,
    ...(user.role === Role.Employee ? { requesterId: user.id } : {}),
  };
}

/**
 * The SAME rule expressed as a raw-SQL predicate, for the Phase 10 analytics
 * aggregates — a median (`percentile_cont`), a per-group average duration and
 * the pause-aware at-risk count are all things Prisma's query API cannot
 * express, so those paths drop to `$queryRaw` and cannot reuse the `where`
 * object above.
 *
 * It is deliberately defined here, immediately beside its Prisma twin, for
 * exactly the reason `knowledge-article-visibility.ts` gives for doing the
 * same: a raw query whose visibility clause silently drifts weaker than the
 * ORM path's is the highest-risk failure mode this helper exists to prevent,
 * and keeping the two definitions adjacent is what makes that drift visible
 * to a reviewer in one glance.
 *
 * The user id is interpolated through a `Prisma.sql` tagged template, so it
 * is a bound parameter and never concatenated into the statement text.
 *
 * Assumes the `tickets` table is aliased `t`.
 */
export function ticketVisibilitySql(user: AuthenticatedUser): Prisma.Sql {
  if (user.role === Role.Employee) {
    return Prisma.sql`t.deleted_at IS NULL AND t.requester_id = ${user.id}::uuid`;
  }
  return Prisma.sql`t.deleted_at IS NULL`;
}
