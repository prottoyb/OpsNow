import type { Role, TicketStatus } from '../../types/api';
import { isStaffRole } from '../../types/api';

/**
 * PRESENTATION ONLY.
 *
 * `backend/src/tickets/tickets.constants.ts` is the authoritative transition
 * matrix and is enforced in `TicketsService.applyStatusTransition()` for every
 * caller, staff or not. This copy exists solely so the UI can offer the right
 * buttons; it grants nothing. `transitions.test.ts` asserts the exact contents
 * below, so if the backend matrix changes and this one does not, the test
 * turns red instead of the UI silently offering an action the server refuses.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
> = {
  New: ['Open', 'InProgress', 'OnHold', 'Resolved', 'Closed'],
  Open: ['InProgress', 'OnHold', 'Resolved', 'Closed'],
  InProgress: ['Open', 'OnHold', 'Resolved', 'Closed'],
  OnHold: ['Open', 'InProgress', 'Resolved', 'Closed'],
  Resolved: ['Closed', 'Open'],
  // Terminal for EVERY role, Administrator included. A recurring issue gets
  // a new ticket rather than reopening the historical one (ADR-019).
  Closed: [],
};

/** The single reopen path available to a ticket's own requester. */
export const REOPEN_TRANSITION = { from: 'Resolved', to: 'Open' } as const;

export function isReopenTransition(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return from === REOPEN_TRANSITION.from && to === REOPEN_TRANSITION.to;
}

/**
 * Transitions to offer this user from this status. A non-staff requester is
 * limited to reopening a Resolved ticket; staff get the whole matrix.
 */
export function availableTransitions(
  from: TicketStatus,
  role: Role,
): readonly TicketStatus[] {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (isStaffRole(role)) {
    return allowed;
  }
  return allowed.filter((to) => isReopenTransition(from, to));
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  New: 'New',
  Open: 'Open',
  InProgress: 'In progress',
  OnHold: 'On hold',
  Resolved: 'Resolved',
  Closed: 'Closed',
};

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status];
}
