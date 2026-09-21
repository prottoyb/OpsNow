import { Role, TicketPriority } from '@prisma/client';
import {
  AuditAction,
  AuditActionName,
  AuditEntityType,
  AuditOutcome,
  AllowedMetadataKey,
} from './audit.constants';
import { sanitizeLoginIdentifier } from './audit.sanitize';
import type { MetadataValue } from './audit.sanitize';

/** Request-derived context. Only ever these two fields — never headers,
 * cookies or bodies — so there is nothing secret to leak through it. */
export interface AuditRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * A fully-formed audit event. Callers never build this by hand: they call one
 * of the per-event builders below, each of which takes explicit, typed scalar
 * arguments. There is deliberately no builder that accepts a request body, a
 * DTO, or an open bag of fields — the public API makes the unsafe thing
 * impossible to express, and `sanitizeMetadata` is the runtime backstop.
 */
export interface AuditEvent {
  action: AuditActionName;
  outcome: AuditOutcome;
  actorId: string | null;
  entityType: AuditEntityType | null;
  entityId: string | null;
  metadata: Partial<Record<AllowedMetadataKey, MetadataValue>>;
  request: AuditRequestContext;
}

function event(
  action: AuditActionName,
  outcome: AuditOutcome,
  parts: Partial<Omit<AuditEvent, 'action' | 'outcome'>>,
): AuditEvent {
  return {
    action,
    outcome,
    actorId: parts.actorId ?? null,
    entityType: parts.entityType ?? null,
    entityId: parts.entityId ?? null,
    metadata: parts.metadata ?? {},
    request: parts.request ?? {},
  };
}

// ---------------------------------------------------------------- auth ----

// Auth events use entityType User + entityId = the account concerned, so a
// query "everything that happened to this account" needs no special case, and
// rows survive (with actor_id nulled) if the user row is later deleted.

export function loginSucceeded(
  userId: string,
  request: AuditRequestContext,
): AuditEvent {
  return event(AuditAction.AuthLoginSucceeded, AuditOutcome.Success, {
    actorId: userId,
    entityType: AuditEntityType.User,
    entityId: userId,
    request,
  });
}

export type LoginFailureReason =
  | 'unknown_account'
  | 'bad_password'
  | 'account_disabled';

/**
 * A failed login. Records THAT it failed, why (coarse, admin-only), the
 * account targeted if one exists, and the submitted email (shape-checked and
 * capped — see sanitizeLoginIdentifier). It takes NO password parameter of
 * any kind, so the password cannot be recorded even by mistake.
 *
 * actorId is null: nobody has authenticated, and attributing an attacker's
 * failed attempt to the victim account as "actor" would be misleading.
 */
export function loginFailed(
  submittedEmail: string,
  reason: LoginFailureReason,
  targetUserId: string | null,
  request: AuditRequestContext,
): AuditEvent {
  return event(AuditAction.AuthLoginFailed, AuditOutcome.Failure, {
    actorId: null,
    entityType: targetUserId ? AuditEntityType.User : null,
    entityId: targetUserId,
    metadata: {
      reason,
      identifier: sanitizeLoginIdentifier(submittedEmail),
    },
    request,
  });
}

export function loggedOut(
  userId: string,
  request: AuditRequestContext,
): AuditEvent {
  return event(AuditAction.AuthLogout, AuditOutcome.Success, {
    actorId: userId,
    entityType: AuditEntityType.User,
    entityId: userId,
    request,
  });
}

export function tokenRefreshed(
  userId: string,
  request: AuditRequestContext,
): AuditEvent {
  return event(AuditAction.AuthTokenRefreshed, AuditOutcome.Success, {
    actorId: userId,
    entityType: AuditEntityType.User,
    entityId: userId,
    request,
  });
}

export type RefreshFailureReason = 'reuse_detected' | 'expired' | 'user_inactive';

export function refreshFailed(
  userId: string,
  reason: RefreshFailureReason,
  request: AuditRequestContext,
): AuditEvent {
  return event(AuditAction.AuthRefreshFailed, AuditOutcome.Failure, {
    actorId: null,
    entityType: AuditEntityType.User,
    entityId: userId,
    metadata: { reason },
    request,
  });
}

export function registered(
  userId: string,
  request: AuditRequestContext,
): AuditEvent {
  return event(AuditAction.AuthRegistered, AuditOutcome.Success, {
    actorId: userId,
    entityType: AuditEntityType.User,
    entityId: userId,
    request,
  });
}

// ------------------------------------------------------------- tickets ----

// Ticket events deliberately record identifiers and WHICH fields changed, not
// the subject/description text: that is user free-text which already lives in
// ticket_history, and copying it into a second, longer-lived, broader-audience
// table would only multiply where it has to be protected. Non-sensitive
// scalars (status, priority, category id, assignee id) keep old/new values.

export function ticketCreated(
  actorId: string,
  ticket: {
    id: string;
    ticketNumber: number | string;
    priority: TicketPriority;
    categoryId: string | null;
  },
): AuditEvent {
  return event(AuditAction.TicketCreated, AuditOutcome.Success, {
    actorId,
    entityType: AuditEntityType.Ticket,
    entityId: ticket.id,
    metadata: {
      ticketNumber: String(ticket.ticketNumber),
      priority: ticket.priority,
      categoryId: ticket.categoryId,
    },
  });
}

export function ticketUpdated(
  actorId: string,
  ticketId: string,
  changedFields: string[],
  categoryChange?: { from: string | null; to: string | null },
): AuditEvent {
  return event(AuditAction.TicketUpdated, AuditOutcome.Success, {
    actorId,
    entityType: AuditEntityType.Ticket,
    entityId: ticketId,
    metadata: {
      changedFields,
      ...(categoryChange
        ? { categoryIdFrom: categoryChange.from, categoryIdTo: categoryChange.to }
        : {}),
    },
  });
}

export function ticketStatusChanged(
  actorId: string,
  ticketId: string,
  from: string,
  to: string,
): AuditEvent {
  return event(AuditAction.TicketStatusChanged, AuditOutcome.Success, {
    actorId,
    entityType: AuditEntityType.Ticket,
    entityId: ticketId,
    metadata: { from, to },
  });
}

export function ticketPriorityChanged(
  actorId: string,
  ticketId: string,
  from: TicketPriority,
  to: TicketPriority,
): AuditEvent {
  return event(AuditAction.TicketPriorityChanged, AuditOutcome.Success, {
    actorId,
    entityType: AuditEntityType.Ticket,
    entityId: ticketId,
    metadata: { from, to },
  });
}

/** Assignment (`to` set) or unassignment (`to` null); `from` is the previous
 * assignee. */
export function ticketAssignmentChanged(
  actorId: string,
  ticketId: string,
  from: string | null,
  to: string | null,
): AuditEvent {
  return event(
    to === null ? AuditAction.TicketUnassigned : AuditAction.TicketAssigned,
    AuditOutcome.Success,
    {
      actorId,
      entityType: AuditEntityType.Ticket,
      entityId: ticketId,
      metadata: { from, to },
    },
  );
}

// -------------------------------------------------------------- assets ----

/** Asset assignment (`to` set, possibly a reassignment) or return (`to` null). */
export function assetAssignmentChanged(
  actorId: string,
  assetId: string,
  from: string | null,
  to: string | null,
): AuditEvent {
  return event(
    to === null ? AuditAction.AssetReturned : AuditAction.AssetAssigned,
    AuditOutcome.Success,
    {
      actorId,
      entityType: AuditEntityType.Asset,
      entityId: assetId,
      metadata: { from, to },
    },
  );
}

// --------------------------------------------------------- permissions ----

/** An authenticated caller refused by the role guard. `route` is the route
 * PATTERN (`/api/v1/tickets/:id`), never the concrete URL or query string. */
export function accessDenied(
  actorId: string,
  actorRole: Role,
  requiredRoles: Role[],
  method: string,
  route: string,
  request: AuditRequestContext,
): AuditEvent {
  return event(AuditAction.AccessDenied, AuditOutcome.Denied, {
    actorId,
    metadata: { actorRole, requiredRoles, method, route },
    request,
  });
}
