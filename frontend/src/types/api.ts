/**
 * Wire types for the OpsNow API (`/api/v1`).
 *
 * These mirror the backend response DTOs under `backend/src/**\/dto/` with
 * one deliberate divergence, called out per-field below:
 *
 *   The backend DTOs declare timestamp fields as `Date`
 *   (e.g. `TicketResponseDto.createdAt!: Date`), but those values cross the
 *   wire as JSON and arrive here as ISO-8601 **strings**. `JSON.parse` never
 *   produces a `Date`. Typing them `Date` on this side compiles perfectly
 *   and then throws at runtime the first time anything calls a `Date`
 *   method on them, so every timestamp below is typed `string` (nullable
 *   exactly where the DTO is nullable) and is parsed explicitly at the
 *   point of display.
 */

export const ROLES = [
  'Employee',
  'SupportAgent',
  'TeamLead',
  'Administrator',
] as const;
export type Role = (typeof ROLES)[number];

/** Mirrors `STAFF_ROLES` in `backend/src/tickets/tickets.constants.ts`. */
export const STAFF_ROLES: readonly Role[] = [
  'SupportAgent',
  'TeamLead',
  'Administrator',
];

export function isStaffRole(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export const TICKET_STATUSES = [
  'New',
  'Open',
  'InProgress',
  'OnHold',
  'Resolved',
  'Closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const COMMENT_VISIBILITIES = ['Public', 'Internal'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

/**
 * Mirrors `SlaResponseState` in `backend/src/sla/sla.constants.ts`.
 *
 * These strings are the ONLY authority on whether a clock has met, breached,
 * or is at risk. The frontend never re-derives any of them from a due date
 * and the browser clock — see DECISIONS.md ADR-021.
 */
export const SLA_RESPONSE_STATES = [
  'Met',
  'Breached',
  'Running',
  'AtRisk',
  'Paused',
  'NoResponse',
] as const;
export type SlaResponseState = (typeof SLA_RESPONSE_STATES)[number];

/**
 * Mirrors `SlaResolutionState`. There is deliberately no resolution
 * equivalent of `NoResponse` — a ticket is only ever resolved or not.
 */
export const SLA_RESOLUTION_STATES = [
  'Met',
  'Breached',
  'AtRisk',
  'Running',
  'Paused',
] as const;
export type SlaResolutionState = (typeof SLA_RESOLUTION_STATES)[number];

/**
 * `GET /auth/me` returns only id/email/role — deliberately NOT the user's
 * name (see `backend/src/auth/auth.controller.ts`). `POST /auth/login` does
 * return the name, but the app shell shows email + role only, so the header
 * renders identically before and after a page reload. The name is never
 * stored.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthenticatedUser & { firstName: string; lastName: string };
}


/**
 * `UserSummaryResponseDto` — id/firstName/lastName/role. There is
 * deliberately **no email** on an embedded user summary, so nothing in the
 * UI may display or expect one for a requester, assignee, comment author or
 * history actor.
 */
export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
}

/** `GET /ticket-categories` returns a BARE ARRAY of these (not `{data,total}`). */
export interface TicketCategory {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

/**
 * `TicketSlaResponseDto`, embedded on every ticket (list and detail) as
 * `sla`, and identical for every role for a ticket that role can already
 * see. Null only when no SLA policy was active for the ticket's priority at
 * creation time.
 *
 * Two fields carry non-obvious semantics that the UI must respect:
 *
 *   `responseMinutesRemaining` / `resolutionMinutesRemaining` are clamped at
 *   0 and FROZEN while `isPaused` — the persisted due dates are not shifted
 *   until the clock resumes, so `dueAt - now` is simply wrong during a
 *   pause. These figures, not the due dates, are what the countdown ages.
 *   On a completed (resolved/closed) clock they keep decaying against
 *   wall-clock time and are meaningless; nothing renders them there.
 *
 *   `totalPausedMinutes` is display-only and is never an input to a
 *   breach/remaining calculation (ADR-020).
 */
export interface TicketSla {
  responseTargetMinutes: number;
  resolutionTargetMinutes: number;
  /** ISO-8601 string over the wire — see the file header. */
  responseDueAt: string;
  /** ISO-8601 string over the wire — see the file header. */
  responseAt: string | null;
  responseState: SlaResponseState;
  responseMinutesRemaining: number;
  /** ISO-8601 string over the wire — see the file header. */
  resolutionDueAt: string;
  resolutionState: SlaResolutionState;
  resolutionMinutesRemaining: number;
  /** True only while the ticket status is OnHold. */
  isPaused: boolean;
  totalPausedMinutes: number;
}

/** `GET /sla-policies` — staff only. Read-only; there is no policy CRUD. */
export interface SlaPolicy {
  id: string;
  name: string;
  priority: TicketPriority;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  isActive: boolean;
}

/**
 * `GET /sla/metrics` — staff only. Seven counts, and deliberately no
 * at-risk aggregate: at-risk is a per-ticket fraction of that ticket's own
 * target, which no single count query can express (ADR-020).
 */
export interface SlaMetrics {
  openWithSla: number;
  resolutionBreachedInFlight: number;
  resolutionBreachedCompleted: number;
  respondedOnTime: number;
  respondedLate: number;
  responseOverdueOutstanding: number;
  neverResponded: number;
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  reopenedCount: number;
  /** ISO-8601 string over the wire — see the file header. */
  resolvedAt: string | null;
  /** ISO-8601 string over the wire — see the file header. */
  closedAt: string | null;
  /** ISO-8601 string over the wire — see the file header. */
  createdAt: string;
  /** ISO-8601 string over the wire — see the file header. */
  updatedAt: string;
  requester: UserSummary;
  assignee: UserSummary | null;
  category: TicketCategory | null;
  /** Null when no SLA policy was active for this priority at creation. */
  sla: TicketSla | null;
}

export interface TicketComment {
  id: string;
  body: string;
  visibility: CommentVisibility;
  /** ISO-8601 string over the wire — see the file header. */
  createdAt: string;
  /** ISO-8601 string over the wire — see the file header. */
  updatedAt: string;
  author: UserSummary;
}

export interface TicketHistoryEntry {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  /** ISO-8601 string over the wire — see the file header. */
  createdAt: string;
  actor: UserSummary | null;
}

/** The `{data,total}` envelope used by every paginated list endpoint. */
export interface Paginated<T> {
  data: T[];
  total: number;
}

export interface ListTicketsQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  assigneeId?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  categoryId?: string;
  priority?: TicketPriority;
}

/**
 * The global ValidationPipe runs with `forbidNonWhitelisted: true`, so an
 * unknown property is a 400 — never spread a fetched ticket into a PATCH
 * body. `categoryId` is `@IsOptional() @IsUUID()` with no null allowance,
 * so a category can be set or changed but never cleared.
 */
export interface UpdateTicketInput {
  subject?: string;
  description?: string;
  categoryId?: string;
}

export interface CreateTicketCommentInput {
  body: string;
  visibility?: CommentVisibility;
}

/** Backend DTO field limits, mirrored for client-side pre-validation only. */
export const FIELD_LIMITS = {
  subject: 255,
  description: 10000,
  commentBody: 5000,
} as const;

export const PAGE_SIZE = 20;
