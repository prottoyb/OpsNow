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
