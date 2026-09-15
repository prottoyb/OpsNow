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

export interface RefreshResponse {
  accessToken: string;
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
export const MAX_PAGE_SIZE = 100;
