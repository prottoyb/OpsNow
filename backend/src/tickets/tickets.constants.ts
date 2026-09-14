import { Role, TicketStatus } from '@prisma/client';

/** Roles that can view/act on any ticket, not just their own. */
export const STAFF_ROLES: readonly Role[] = [
  Role.SupportAgent,
  Role.TeamLead,
  Role.Administrator,
];

export function isStaffRole(role: Role): boolean {
  return (STAFF_ROLES as Role[]).includes(role);
}

/**
 * Explicit status transition matrix (backend.md: business rules live in
 * the domain layer, not a free-form enum write). `Closed` is a terminal
 * state in Phase 6 — a closed ticket that recurs requires a new ticket
 * rather than reopening the historical one (see ADR-019).
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  [TicketStatus.New]: [
    TicketStatus.Open,
    TicketStatus.InProgress,
    TicketStatus.OnHold,
    TicketStatus.Resolved,
    TicketStatus.Closed,
  ],
  [TicketStatus.Open]: [
    TicketStatus.InProgress,
    TicketStatus.OnHold,
    TicketStatus.Resolved,
    TicketStatus.Closed,
  ],
  [TicketStatus.InProgress]: [
    TicketStatus.Open,
    TicketStatus.OnHold,
    TicketStatus.Resolved,
    TicketStatus.Closed,
  ],
  [TicketStatus.OnHold]: [
    TicketStatus.Open,
    TicketStatus.InProgress,
    TicketStatus.Resolved,
    TicketStatus.Closed,
  ],
  [TicketStatus.Resolved]: [TicketStatus.Closed, TicketStatus.Open],
  [TicketStatus.Closed]: [],
};

/** The only reopen path in Phase 6. Only the ticket's own requester (in
 * addition to any staff role) may perform this specific transition. */
export const REOPEN_TRANSITION = {
  from: TicketStatus.Resolved,
  to: TicketStatus.Open,
} as const;

export function isReopenTransition(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return from === REOPEN_TRANSITION.from && to === REOPEN_TRANSITION.to;
}
