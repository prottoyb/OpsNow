# API Overview

This is a human-readable guide to the conventions the OpsNow API follows.
It is deliberately not a full endpoint reference — Swagger already
generates that from the code and can't drift from it, so this document
explains the shape of the API instead of repeating every route by hand.

## Base path and versioning

Every route is served under `/api/v1`. There is no unversioned path.

## Interactive reference: Swagger

`GET /api/docs` serves the full OpenAPI document and an interactive UI —
every route, DTO shape, and `@Roles()` gate, generated directly from the
controllers and decorators, so it cannot drift from the implementation
the way hand-maintained endpoint docs would.

Swagger is **on by default outside production** and **off by default in
production**, overridable either way by `SWAGGER_ENABLED` (ADR-027). It
has no authentication in front of it, so enabling it in production is a
deliberate opt-in that also logs a startup warning — publishing the
complete API surface, including every role gate, is a real exposure to
weigh, not a checkbox.

## Authentication model

- **Access tokens**: short-lived JWTs, sent as `Authorization: Bearer
  <token>`. Issued by `POST /auth/login`, `POST /auth/register`, and
  `POST /auth/refresh`.
- **Refresh tokens**: never appear in any JSON response. They travel only
  as an `httpOnly`, `SameSite=Strict`, path-scoped cookie the browser
  attaches automatically and JavaScript can never read.
- **Every route requires authentication by default.** A route is public
  only if explicitly marked `@Public()` in the code (ADR-018) — currently
  `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
  `POST /auth/logout`, and `GET /health`, `GET /health/live`.

### Refresh-cookie behaviour

- `/auth/refresh` and `/auth/logout` reject a request whose `Origin`
  header doesn't match the trusted origin — a cross-origin site cannot
  ride the cookie to rotate or kill a session, even though the cookie
  itself would otherwise be sent automatically.
- Refresh is single-use and atomic: presenting a token a second time (a
  sign the token was stolen and already used by someone else) revokes the
  **entire** token family, not just that one token.
- `SameSite=Strict` means the refresh cookie only travels on a same-site
  navigation/request — which is also why the API and the SPA must be
  same-origin in every deployment (see
  `docs/architecture/system-architecture.md`).

## RBAC model

Four fixed roles: `Employee`, `SupportAgent`, `TeamLead`, `Administrator`
(ADR-006). Most staff-gated routes accept any of `SupportAgent`,
`TeamLead`, `Administrator` — referred to below as **staff**. A few
routes are narrower:

| Scope | Roles | Why |
| --- | --- | --- |
| `GET /users` | Administrator only | Lists every user's email; no other role needs a directory. |
| `GET /audit-logs` | Administrator only | Records every user's actions including authentication events. |
| `GET /analytics/agents` | TeamLead, Administrator | Ranks individual staff members against each other — line-management information. |
| Everything else staff-gated | SupportAgent, TeamLead, Administrator | Operational access, not tied to seniority. |

`RolesGuard` is registered globally and fails **closed** on an empty
`@Roles()` list — a route with no roles declared and no `@Public()` marker
is unreachable by anyone, not open to everyone.

## Row-level visibility (not the same as RBAC)

RBAC answers "can this role call this route at all." A second, independent
layer answers "which rows can this specific caller see" — e.g. an
`Employee` can call `GET /tickets/:id` but only for tickets they raised;
staff can call it for any ticket. This is enforced by shared service-layer
helpers (`ticketVisibilityWhere`, the asset-visibility equivalent),
applied to every read and to the `where` clause of every write, not left
to a per-controller check.

## Error envelope

Every error response — validation failure, not-found, conflict, or an
unhandled exception — has the same shape:

```json
{
  "statusCode": 404,
  "timestamp": "2026-09-23T12:00:00.000Z",
  "path": "/api/v1/tickets/…",
  "message": "…"
}
```

No response body ever contains a stack trace. 5xx and non-HTTP exceptions
are logged server-side only; the client sees a generic message.

## 404 vs. 403

A resource **outside the caller's visibility scope** — wrong owner, or
soft-deleted — returns **404**, not 403, everywhere in the app (ADR-019).
This is deliberate: a 403 on a resource ID the caller doesn't legitimately
have confirms the resource exists, which is itself information leakage.
A **403** means the resource is visible but the specific action is not
allowed for this role (e.g. a staff-only route called by an Employee, or
an Employee calling `GET /tickets/:id/history`, which is staff-only even
for the ticket's own requester).

## Concurrency and 409

Ticket assignment, ticket status transitions, and asset assignment all use
an optimistic compare-and-swap: the write is a conditional `updateMany`
gated on the row's state as last read. A losing concurrent request gets a
clean **409 Conflict**, never a silent overwrite and never a corrupted
partial write. Every mutation that also writes a history/ledger row does
so in the same database transaction as the state change, so history and
state can never drift apart.

## Pagination and filtering

List endpoints that can return an unbounded number of rows use
`{ data: T[], total: number }` with `limit`/`offset` query parameters
(`PaginationQueryDto`). Small, fixed reference lists — `ticket-categories`,
`asset-types`, `kb-categories` — return a bare array instead; they are not
resources that grow, so the pagination envelope would be noise.

Filters are always plain query parameters, validated and whitelisted by
the global `ValidationPipe` — an unrecognized query parameter is a 400,
not a silently ignored value.

## Major endpoint groups

| Group | Base path | Notes |
| --- | --- | --- |
| Auth | `/auth/*` | register, login, refresh, logout, `me` |
| Users | `/users` | Administrator-only directory |
| Tickets | `/tickets/*` | CRUD, assignment, status/priority, comments, history, linked assets/articles |
| Ticket categories | `/ticket-categories` | read-only reference list |
| SLA | `/sla-policies`, `/sla/metrics` | staff-only; per-ticket SLA state is embedded in ticket responses |
| Assets | `/assets/*` | CRUD, assignment (single seam for all assignment changes), assignment history |
| Asset types | `/asset-types` | read-only reference list |
| Knowledge base | `/kb-articles/*`, `/kb-categories` | authoring, search, feedback |
| Analytics | `/analytics/*` | ticket/SLA/category metrics (staff), agent metrics (TeamLead/Administrator) |
| Audit | `/audit-logs` | Administrator-only, append-only |
| AI assistant | `/ai/status`, `/tickets/:id/ai/*` | optional, off by default — see below |
| Health | `/health`, `/health/live` | public; readiness vs. liveness |

See Swagger (`/api/docs`) for the exact request/response shape of each
route, including every DTO field and validation rule.

## AI endpoint configuration expectations

`GET /ai/status` reports whether the assistant is configured — it never
errors on an unconfigured server, since "not configured" is the expected
default state (ADR-023). The three action endpoints
(`/tickets/:id/ai/triage`, `/draft-response`, `/resolution-summary`) are
staff-only and:

- return a clear, typed failure (never a raw provider error) if the
  provider is unavailable, rate-limited, or times out;
- answer **503** with a `busy` reason under the in-process concurrency cap
  (per-instance, not shared across replicas — a known, documented
  limitation, not a bug);
- persist nothing — a triage result, draft, or summary is not saved
  server-side and is lost on refresh, by design (ADR-023 Decision 11);
- never write to a ticket directly. Applying a suggestion is always a
  second, explicit call to the ordinary ticket-mutation endpoints.

Configuration is three environment variables:
`AI_PROVIDER` (`disabled` | `mock` | `anthropic`), `AI_API_KEY`, and
optionally `AI_MODEL`/`AI_TIMEOUT_MS`. `mock` is rejected outright in
production. See `backend/.env.example` for the full comment block.
