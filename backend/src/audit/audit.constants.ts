import { Role } from '@prisma/client';

/**
 * Every audit action the application can record. A closed set: the read API
 * validates its `action` filter against it, and each value has exactly one
 * event-builder in audit.events.ts.
 */
export const AuditAction = {
  AuthLoginSucceeded: 'auth.login.succeeded',
  AuthLoginFailed: 'auth.login.failed',
  AuthLogout: 'auth.logout',
  AuthTokenRefreshed: 'auth.token.refreshed',
  AuthRefreshFailed: 'auth.token.refresh_failed',
  AuthRegistered: 'auth.registered',
  TicketCreated: 'ticket.created',
  TicketUpdated: 'ticket.updated',
  TicketStatusChanged: 'ticket.status_changed',
  TicketPriorityChanged: 'ticket.priority_changed',
  TicketAssigned: 'ticket.assigned',
  TicketUnassigned: 'ticket.unassigned',
  AssetAssigned: 'asset.assigned',
  AssetReturned: 'asset.returned',
  AccessDenied: 'access.denied',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];
export const AUDIT_ACTIONS = Object.values(AuditAction) as AuditActionName[];

/** Stored under `metadata.outcome` — the AuditLog model has no outcome
 * column, and adding one would need a migration. */
export enum AuditOutcome {
  Success = 'success',
  Failure = 'failure',
  Denied = 'denied',
}

/** What `entityType` may hold. */
export enum AuditEntityType {
  User = 'User',
  Ticket = 'Ticket',
  Asset = 'Asset',
}

/** The audit log records every user's activity; only Administrators read it. */
export const AUDIT_READ_ROLES: Role[] = [Role.Administrator];

/**
 * The ONLY metadata keys that may reach the database. Anything else is
 * dropped by `sanitizeMetadata`, whatever the caller passed. Adding a key
 * here is a deliberate, reviewable act — that is the point.
 */
export const ALLOWED_METADATA_KEYS = [
  'outcome',
  'reason',
  'identifier',
  'ticketNumber',
  'priority',
  'categoryId',
  'categoryIdFrom',
  'categoryIdTo',
  'changedFields',
  'from',
  'to',
  'requiredRoles',
  'actorRole',
  'method',
  'route',
] as const;

export type AllowedMetadataKey = (typeof ALLOWED_METADATA_KEYS)[number];

export const MAX_METADATA_STRING_LENGTH = 255;
export const MAX_USER_AGENT_LENGTH = 512;
