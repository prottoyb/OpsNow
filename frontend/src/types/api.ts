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

export const ASSET_STATUSES = [
  'InStock',
  'Assigned',
  'InRepair',
  'Retired',
  'Lost',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/**
 * `GET /asset-types` returns a BARE ARRAY of these (not `{data,total}`),
 * active types only. Read-only — there is no asset-type CRUD in this phase.
 */
export interface AssetType {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Asset {
  id: string;
  /** Stable human-facing identifier, e.g. "LAPTOP-0001". Not editable after creation. */
  assetTag: string;
  name: string;
  status: AssetStatus;
  serialNumber: string | null;
  /**
   * Date-only over the wire but still a full ISO-8601 timestamp string (see
   * the file header) — the backend DTO types it `Date`. The create/edit form
   * reads and writes only the date portion via a native
   * `<input type="date">`.
   */
  purchaseDate: string | null;
  /** ISO-8601 string over the wire — see the file header and `purchaseDate`. */
  warrantyExpiresAt: string | null;
  notes: string | null;
  /** ISO-8601 string over the wire — see the file header. */
  createdAt: string;
  /** ISO-8601 string over the wire — see the file header. */
  updatedAt: string;
  assetType: AssetType;
  currentAssignee: UserSummary | null;
}

/**
 * The narrow projection an asset takes when embedded in something else —
 * today, a ticket <-> asset link (`TicketAsset.asset`). Deliberately missing
 * `serialNumber`, `notes`, `currentAssignee` and the purchase/warranty dates:
 * those stay behind the row-scoped `GET /assets/:id`. This shape is the same
 * for every role.
 */
export interface AssetSummary {
  id: string;
  assetTag: string;
  name: string;
  status: AssetStatus;
  assetType: AssetType;
}

/**
 * One row of an asset's assignment ledger — staff only
 * (`GET /assets/:id/assignments`). An open row (`returnedAt === null`) is
 * the asset's current holding; closed rows are past holdings. This ledger IS
 * the asset's history; there is no separate audit endpoint.
 */
export interface AssetAssignment {
  id: string;
  assetId: string;
  /** ISO-8601 string over the wire — see the file header. */
  assignedAt: string;
  /** Null while the assignment is still open. ISO-8601 string when set. */
  returnedAt: string | null;
  notes: string | null;
  assignedTo: UserSummary;
  assignedBy: UserSummary;
}

/**
 * A ticket <-> asset link, from `GET /tickets/:id/assets`. Returns a BARE,
 * UNPAGINATED array — the list is bounded by how many assets one ticket has.
 * Readable by anyone who can already see the ticket.
 */
export interface TicketAsset {
  ticketId: string;
  /** ISO-8601 string over the wire — see the file header. */
  linkedAt: string;
  /** Null if the linking user has since been removed. */
  linkedBy: UserSummary | null;
  asset: AssetSummary;
}

export interface ListAssetsQuery {
  status?: AssetStatus;
  assetTypeId?: string;
  assigneeId?: string;
  /** Free-text search against assetTag, name and serialNumber. Max 100 chars. */
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * `status` and `currentAssigneeId` are deliberately absent: a new asset is
 * always created InStock and unassigned — assignment happens only through
 * `PATCH /assets/:id/assignment`.
 */
export interface CreateAssetInput {
  assetTag: string;
  name: string;
  assetTypeId: string;
  serialNumber?: string;
  /** YYYY-MM-DD, as produced by a native `<input type="date">`. */
  purchaseDate?: string;
  /** YYYY-MM-DD, as produced by a native `<input type="date">`. */
  warrantyExpiresAt?: string;
  notes?: string;
}

/**
 * The global ValidationPipe runs with `forbidNonWhitelisted: true`, so the
 * body must contain only the fields being changed — never a whole asset
 * spread into a PATCH. `assetTag` is not editable and has no field here.
 *
 * `serialNumber`, `purchaseDate`, `warrantyExpiresAt` and `notes` accept an
 * explicit `null` to clear them; omitting a key leaves it unchanged.
 *
 * `status` is validated whenever the key is present AT ALL, including a
 * value equal to the asset's current status — `Assigned` is always
 * rejected here, and so is any status on an asset that currently has an
 * assignee. Never include this key from the general edit form
 * (`AssetForm`); it is owned by `AssetStatusControl`, which sends it only
 * as a deliberate, standalone status change.
 */
export interface UpdateAssetInput {
  name?: string;
  assetTypeId?: string;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  warrantyExpiresAt?: string | null;
  notes?: string | null;
  status?: AssetStatus;
}

/**
 * `assignedToId` is required-but-nullable on the backend DTO, so the key is
 * always sent: a uuid assigns/reassigns, `null` returns the asset to stock.
 * `notes` is legal ONLY when the assignment actually changes — a same-value
 * submission plus notes is a 400, since there is no ledger row to record it
 * on.
 */
export interface AssignAssetInput {
  assignedToId: string | null;
  notes?: string;
}

/**
 * Mirrors the `KnowledgeArticleStatus` Prisma enum.
 *
 * `Archived` is the retire path — there is no DELETE on an article — and no
 * status is terminal. The legal moves are defined by
 * `ALLOWED_ARTICLE_TRANSITIONS` in
 * `backend/src/knowledge-base/knowledge-base.constants.ts` and mirrored in
 * `features/knowledge-base/articleStatus.ts`; notably `Archived` may return
 * to `Draft` but never straight to `Published`.
 */
export const KNOWLEDGE_ARTICLE_STATUSES = [
  'Draft',
  'Published',
  'Archived',
] as const;
export type KnowledgeArticleStatus =
  (typeof KNOWLEDGE_ARTICLE_STATUSES)[number];

/**
 * `GET /kb-categories` returns a BARE ARRAY of these (not `{data,total}`),
 * active categories only.
 *
 * Shaped identically to `TicketCategory` on purpose — the two taxonomies are
 * separate tables presenting the same flat id/name/parentId/isActive
 * contract, so `buildCategoryTree` serves both.
 */
export interface KnowledgeBaseCategory {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

/**
 * The shape an article takes in a LIST, and wherever it is embedded in
 * something else (today, a ticket <-> article link).
 *
 * It carries `excerpt` and deliberately NOT `content`: a body is capped at
 * 50,000 characters, so a full page of rows would otherwise be megabytes for
 * a client rendering one line each. The body is fetched deliberately, one
 * article at a time, through `GET /kb-articles/:id`.
 *
 * `helpfulCount`/`notHelpfulCount` are aggregate and cheap to batch. The
 * caller's OWN vote is not here — it is only useful on the detail view,
 * where it arrives inside `KnowledgeArticle.feedback`.
 */
export interface KnowledgeArticleSummary {
  id: string;
  title: string;
  /**
   * Stable URL-safe identifier derived from the title at creation and frozen
   * thereafter. Display only — every route in this API is id-based, so this
   * is never used to look an article up.
   */
  slug: string;
  status: KnowledgeArticleStatus;
  /** Single-line plain-text preview of the body, built by the backend. */
  excerpt: string;
  category: KnowledgeBaseCategory | null;
  author: UserSummary;
  /**
   * Instant of the most recent publication; survives a later unpublish or
   * archive. Null if never published. ISO-8601 string over the wire — see the
   * file header.
   */
  publishedAt: string | null;
  viewCount: number;
  /** ISO-8601 string over the wire — see the file header. */
  updatedAt: string;
  helpfulCount: number;
  notHelpfulCount: number;
}

/** The caller's OWN vote on an article, echoed back so the widget can render
 * in its current state. Always scoped to the requesting user. */
export interface MyArticleFeedback {
  isHelpful: boolean;
  comment: string | null;
  /** ISO-8601 string over the wire — see the file header. */
  createdAt: string;
}

/**
 * What EVERY role may know about an article's feedback: the two aggregate
 * counts plus the caller's own vote. The free-text comments of OTHER readers,
 * and who wrote them, are deliberately absent — they live behind the
 * staff-only `GET /kb-articles/:id/feedback`.
 */
export interface ArticleFeedbackSummary {
  helpfulCount: number;
  notHelpfulCount: number;
  myFeedback: MyArticleFeedback | null;
}

/**
 * One row of the STAFF-ONLY feedback log (`GET /kb-articles/:id/feedback`,
 * 403 for an Employee). A comment is unsolicited free text a colleague wrote
 * about somebody's work believing only the support team would read it, so it
 * is paired with its author's identity and must never be rendered to a
 * non-staff viewer.
 */
export interface ArticleFeedbackEntry {
  id: string;
  isHelpful: boolean;
  comment: string | null;
  /** ISO-8601 string over the wire — see the file header. */
  createdAt: string;
  user: UserSummary;
}

/**
 * The full article from `GET /kb-articles/:id` (also echoed by create and
 * update). This is the only projection that carries `content`.
 *
 * `content` is plain, user-authored text and is rendered as a React text node
 * with `whitespace-pre-wrap`. It is never parsed as Markdown or HTML — see
 * the comment on `ArticleBody` in `pages/ArticleDetailPage.tsx`.
 */
export interface KnowledgeArticle {
  id: string;
  title: string;
  /** See `KnowledgeArticleSummary.slug` — display only, never a lookup key. */
  slug: string;
  content: string;
  status: KnowledgeArticleStatus;
  category: KnowledgeBaseCategory | null;
  author: UserSummary;
  /** See `KnowledgeArticleSummary.publishedAt`. ISO-8601 string, or null. */
  publishedAt: string | null;
  /** Includes the read that returned this response, for a Published article.
   * Staff previewing a Draft or Archived article do not move the counter. */
  viewCount: number;
  /** ISO-8601 string over the wire — see the file header. */
  createdAt: string;
  /** ISO-8601 string over the wire — see the file header. */
  updatedAt: string;
  feedback: ArticleFeedbackSummary;
}

/**
 * A ticket <-> knowledge-article link, from
 * `GET /tickets/:id/knowledge-articles`. Returns a BARE, UNPAGINATED array —
 * the list is bounded by how many articles one ticket has. Already filtered
 * to what the caller may see, so an Employee never learns a Draft is attached
 * to their ticket.
 */
export interface TicketKnowledgeArticle {
  ticketId: string;
  /** ISO-8601 string over the wire — see the file header. */
  linkedAt: string;
  /** Null if the linking user has since been removed. */
  linkedBy: UserSummary | null;
  article: KnowledgeArticleSummary;
}

/**
 * `status` and `authorId` are staff-oriented filters but are NOT role-gated
 * by the backend: the caller's visibility clause is ANDed in as its own
 * top-level clause, so a filter can only ever NARROW a result set. An
 * Employee asking for `status=Draft` gets an empty page, not an error.
 */
export interface ListArticlesQuery {
  /** Full-text search over title and content (Postgres websearch syntax).
   * Max 200 chars. */
  q?: string;
  categoryId?: string;
  status?: KnowledgeArticleStatus;
  authorId?: string;
  limit?: number;
  offset?: number;
}

/**
 * `status`, `slug`, `authorId`, `publishedAt` and `viewCount` are
 * deliberately absent. An article is always born `Draft`, authored by the
 * caller, with a server-derived slug; `forbidNonWhitelisted: true` makes a
 * client that sends any of them a 400 rather than silently ignoring it.
 */
export interface CreateArticleInput {
  title: string;
  content: string;
  categoryId?: string;
}

/**
 * The global ValidationPipe runs with `forbidNonWhitelisted: true`, so the
 * body must contain only the fields being changed — never a whole article
 * spread into a PATCH. `slug` is frozen at creation and has no field here.
 *
 * `categoryId` accepts an explicit `null` to move an article out of its
 * category. That is a deliberate divergence from `UpdateTicketInput`, whose
 * `categoryId` is `@IsOptional() @IsUUID()` with no null allowance and so can
 * be set or changed but never cleared.
 *
 * `status` is restricted to TeamLead/Administrator: a SupportAgent sending
 * this key is a 403 even on an article they wrote themselves, so it must
 * never be included by the general edit form. Unlike a ticket status change,
 * submitting the CURRENT status is an accepted no-op rather than an error.
 */
export interface UpdateArticleInput {
  title?: string;
  content?: string;
  categoryId?: string | null;
  status?: KnowledgeArticleStatus;
}

/**
 * Upsert semantics: one person holds one current opinion of an article, so a
 * re-vote REPLACES the previous one — including its comment. Omitting
 * `comment` therefore CLEARS whatever note was left before, rather than
 * preserving one written for a vote that no longer stands.
 */
export interface CreateArticleFeedbackInput {
  isHelpful: boolean;
  comment?: string;
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
  assetTag: 50,
  assetName: 150,
  serialNumber: 100,
  assetNotes: 5000,
  articleTitle: 200,
  articleContent: 50000,
  articleFeedbackComment: 1000,
} as const;

export const PAGE_SIZE = 20;
