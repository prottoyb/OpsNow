# OpsNow — Diagram Summaries

This document explains what each diagram in this folder shows, why it's drawn the way it is, and what it tells you about how OpsNow is actually built. It's meant to be read alongside the PNG file the heading refers to. Every diagram has a matching `.mmd` Mermaid source file of the same name — that's the file to edit if the application changes; regenerate the PNG from it rather than hand-editing the image (see "Regenerating these diagrams" at the end).

OpsNow is a full-stack IT Service Management (ITSM) platform: a React single-page app talking to a versioned NestJS REST API, backed by a single PostgreSQL database (18 tables — `User`, `RefreshToken`, `Ticket`, `TicketComment`, `TicketHistory`, `TicketCategory`, `SlaPolicy`, `TicketSla`, `Asset`, `AssetType`, `AssetAssignment`, `TicketAsset`, `KnowledgeBaseCategory`, `KnowledgeBaseArticle`, `KnowledgeBaseArticleFeedback`, `TicketKnowledgeArticle`, `Notification`, `AuditLog`). Eleven diagrams cover it end to end: the runtime architecture, the two halves of the database schema, what the product does, the ticket workflow and its concurrency guarantees, the authentication model, the access-control model, the SLA engine, the CI/CD pipeline, and how the whole thing actually runs (dev and container/runtime).

---

## 1. System Architecture
**File:** `01-system-architecture.png` / `01-system-architecture.mmd`

### What it shows
The runtime request path, top to bottom: a browser running the React SPA, through a same-origin edge (Vite's dev proxy locally, nginx in production/Docker), into the NestJS REST API's global protections, out to its eight feature modules, down through Prisma into PostgreSQL — with a dashed, optional branch off to an external AI provider.

### Why the "same-origin edge" layer exists
OpsNow's refresh-token cookie is `httpOnly`, `SameSite=Strict`, and path-scoped to `/api/v1/auth`, and the backend enables no CORS at all (ADR-027). This is a **deliberate, multiply-enforced design choice, not an inherent limitation of the browser platform**: a cross-origin, credentialed (cookie-based) setup *is* generally possible on the web via `SameSite=None` plus an explicit CORS allow-list — OpsNow simply doesn't build that. It forecloses a split-origin deployment through three independent mechanisms at once: no `Domain` attribute on the cookie (so it's scoped to the exact host that set it), `SameSite=Strict` (so it isn't sent on cross-site requests), and a request-time `assertTrustedOrigin()` check in the auth controller that rejects any request whose `Origin` header doesn't match its `Host` — defense-in-depth on top of the cookie attributes themselves. Because of that combination, the frontend and the API must appear as one origin to the browser, which is why a proxy sits between them in every environment: Vite's dev-server proxy locally, and nginx serving the compiled SPA while forwarding `/api` requests to the backend in Docker/production. A split-origin deployment would be a design change (a different cookie policy plus real CORS configuration), not a flag to flip.

### The API's global protections
Every request that reaches the API is subject to the same protections regardless of which of the eight feature modules ultimately handles it — but these are **concerns applied to every request, not a literal single-file sequence**. NestJS's actual execution order is middleware → guards → interceptors (pre-handler) → pipes (at parameter-binding time, inside route-handler resolution) → the handler → interceptors (post-handler) → exception filters, which wrap the *entire* request as a catch-all rather than running as a final pipeline stage. Concretely:
- **Authentication** — `JwtAuthGuard`, registered globally, default-deny (ADR-018): a route is reachable without a valid access token only if it's explicitly marked `@Public()`.
- **RBAC** — `RolesGuard`, enforcing `@Roles(...)` role-list annotations and failing closed if a route declares no allowed roles at all (ADR-006). Guards run before pipes, not after.
- **Request validation** — a global `ValidationPipe` (whitelist, `forbidNonWhitelisted`, transform) rejects any request with unexpected fields.
- **Standardized errors** — a global `AllExceptionsFilter` guarantees every error response has the same shape and never leaks a stack trace, by wrapping the whole request rather than running "last."
- **Row-level visibility** — inside each service (e.g. `ticketVisibilityWhere`, `asset-visibility.ts`), applied to every read and to the `where` clause of every write. This is a second, independent authorization layer beneath route-level RBAC, not a redundant restatement of it.

This is what makes the eight feature modules (Auth & Users, Tickets, SLA, Assets, Knowledge Base, Analytics, Audit Log, AI Assistant) safe to reason about individually.

### The data layer and the external boundary
Every module talks to PostgreSQL exclusively through Prisma. The AI provider boundary is a separate, dashed subgraph because it's optional and off by default: with no `AI_PROVIDER` environment variable set, that branch of the diagram is inert (ADR-023).

### Key takeaway
This is a conventional two-tier web application on purpose — no microservices, no message queue, no API gateway.

---

## 2. Core ITSM Data Model
**File:** `02-database-erd-core.png` / `02-database-erd-core.mmd`

### What it shows
The ERD for the tables that do the work of an IT service desk: `USER`, `TICKET`, `TICKET_COMMENT`, `TICKET_HISTORY`, `TICKET_CATEGORY`, `SLA_POLICY`, `TICKET_SLA`, `ASSET`, `ASSET_TYPE`, and `ASSET_ASSIGNMENT`.

### How to read the relationships
- **A user wears two hats on a ticket.** The `USER`–`TICKET` relationship appears twice — "requests" (`Ticket.requesterId`) and "is assigned" (`Ticket.assigneeId`, nullable) — two distinct foreign keys, both living on `Ticket`.
- **`TICKET_COMMENT` and `TICKET_HISTORY` are not equally immutable.** `TICKET_HISTORY` is genuinely append-only: the schema gives it no `updatedAt` or `deletedAt` column at all, so there is no field to record an edit or a delete through. `TICKET_COMMENT` is a different story — its schema **does** carry `updatedAt` and `deletedAt` columns (edit/soft-delete support exists at the data-model level), but as of the current build no controller route exercises them (`POST`/`GET` only, no `PATCH`/`DELETE` on comments) — so comments are immutable in practice today, for application-behavior reasons, not because the schema forbids it. That distinction is drawn on the diagram itself rather than asserted only in prose.
- **`TICKET_SLA` is a true one-to-one extension of `TICKET`** (`ticketId` is unique), created at the same time as the ticket, holding both its response and resolution clocks. The `SLA_POLICY` it's snapshotted from is a separate table, with `onDelete: SetNull` on the link, specifically so editing or deleting the policy later never rewrites the targets already committed to an in-flight ticket.
- **`ASSET_ASSIGNMENT` is a ledger, not a status field.** Every assignment and return is its own row. `Asset.status`/`currentAssigneeId` are kept in sync with the *latest* ledger row as ordinary mutable columns — the full history is reconstructable from the ledger, but the current state itself is not event-sourced.
- **Categories are self-referencing hierarchies** via `parentId`.
- **The `TICKET`↔`ASSET` many-to-many relationship is a real physical bridge table, `TicketAsset` (`ticket_assets`, composite primary key `[ticketId, assetId]`, plus `linkedAt`/`linkedById`) — it's collapsed to a single labeled edge on the diagram for readability ("linked via TICKET_ASSET"), not omitted or hidden.**

### Design details worth noting
Every primary key is a UUID (`Ticket.id` included) generated by Prisma's `uuid()` default. `Ticket.ticketNumber` is a **separate, independent field** — a real database-sequence auto-incrementing integer — that exists purely so a person can say "ticket #4821" out loud; it was never a primary-key candidate, so it's more accurate to describe the design as "a UUID primary key, plus a separate unique human-readable `ticketNumber`" than as "the one exception to UUID primary keys." Several fields carry a `deletedAt` timestamp instead of being hard-deleted (`User`, `Ticket`, `TicketComment`, `Asset`) so a "removed" record still makes sense in historical reports and audit trails; `TicketHistory`, `TicketCategory`, `SlaPolicy`, `TicketSla`, `AssetType`, `AssetAssignment`, and `TicketAsset` are hard-delete-only (no `deletedAt` column exists for them).

### Key takeaway
Tickets and assets are built on ordinary **mutable current-state fields** (`status`, `currentAssigneeId`, etc.) paired with a **separate append-only ledger** (`TicketHistory`, `AssetAssignment`) that preserves how they got there — not on event-sourcing where current state is derived by replaying history.

---

## 3. Supporting Data Model (Knowledge Base, Notifications, Audit, Sessions)
**File:** `03-database-erd-supporting.png` / `03-database-erd-supporting.mmd`

### What it shows
The second half of the schema: `REFRESH_TOKEN`, the knowledge-base cluster (`KNOWLEDGE_BASE_CATEGORY`, `KNOWLEDGE_BASE_ARTICLE`, `KNOWLEDGE_BASE_ARTICLE_FEEDBACK`), `NOTIFICATION`, and `AUDIT_LOG`.

### The pieces worth explaining individually
**Refresh tokens and rotation.** `REFRESH_TOKEN` has a self-referencing `replacedById` field (`onDelete: SetNull`) — each row can point to the row that replaced it, which is the mechanism behind reuse detection. The token itself is a random 64-byte value; what's stored is its **SHA-256 hash** (`tokenHash`) — a different, and correctly different, mechanism from the Argon2id used for passwords, since a refresh token is already high-entropy random data rather than something a human chose.

**Knowledge base.** Articles belong to a self-referencing category hierarchy, are authored by a user, and can receive one feedback row per user per article. The `TICKET`↔`KNOWLEDGE_BASE_ARTICLE` many-to-many relationship is, like the ticket/asset link, a **real physical bridge table** (`TicketKnowledgeArticle`, composite primary key) collapsed to a single labeled edge ("linked via TICKET_KNOWLEDGE_ARTICLE") for readability. Full-text search runs through a generated `tsvector` column inside PostgreSQL itself, not a separate search service.

**Audit log.** `entityType`/`entityId` are a polymorphic reference with **no foreign key constraint** — a considered trade-off (ADR-025) so the table doesn't need a new constraint every time a new auditable entity type is added. `metadata` is a JSON blob that's structurally redacted before anything sensitive could end up in it.

**Notifications.** This table exists in the schema and is shown here for completeness, but genuinely has **zero** application code reading or writing it anywhere in the backend — confirmed by searching the source, not assumed. It's reserved for a phase that was scoped but never scheduled.

### Key takeaway
This half of the schema is where the project's security and operational posture is encoded directly into the data model: sessions that can detect their own theft, an audit trail that's cheap to extend, and full-text search with no external dependency.

---

## 4. What OpsNow Does (Feature Overview)
**File:** `04-feature-overview.png` / `04-feature-overview.mmd`

### What it shows
A non-technical summary: OpsNow at the center, fanning out to its seven user-facing capabilities, with a note naming the four-role access model that applies across all of them.

### The seven areas, briefly
- **Ticket Management** — raise, triage, assign, resolve, track.
- **SLA Management** — response and resolution clocks, breach/at-risk detection.
- **Asset Management** — inventory, assignment history, link to tickets.
- **Knowledge Base** — searchable self-service articles, full-text search, feedback.
- **Dashboard & Analytics** — ticket, SLA, category and agent performance metrics computed from live data.
- **Audit Log** — an append-only record of every sensitive action.
- **AI Assistant** — optional, staff-only, advisory: it can draft a triage suggestion, a reply, or a resolution summary, but nothing it produces changes a ticket by itself — a suggestion is applied only by a second, explicit `PATCH /tickets/:id` call that gets the same validation, concurrency check and history write as a change a person typed.

### Key takeaway
"Four roles, one system" signals this isn't seven disconnected tools, but one dataset viewed through a role-appropriate lens — detailed in diagram 7.

---

## 5. Ticket Lifecycle (Status State Machine)
**File:** `05-ticket-lifecycle.png` / `05-ticket-lifecycle.mmd`

### What it shows
The actual status state machine, taken from the backend's transition constants: `New → Open → InProgress`, a pause branch to `OnHold` and back, a path to `Resolved → Closed`, and a reopen edge from `Resolved` back to `Open`.

### Two rules worth calling out explicitly
1. **`Closed` is terminal for every role, including Administrator.** No override exists in code.
2. **`Resolved` is the only status a ticket can reopen from**, and reopening (`Resolved → Open`) is the *only* self-service transition a non-staff requester may trigger themselves — staff may perform any transition the matrix allows, not just reopen.

### The full transition matrix (not all drawn as arrows)
`New` → Open, InProgress, OnHold, Resolved, Closed · `Open` → InProgress, OnHold, Resolved, Closed · `InProgress` → Open, OnHold, Resolved, Closed · `OnHold` → Open, InProgress, Resolved, Closed · `Resolved` → Closed, Open (reopen) · `Closed` → nothing. The diagram draws the main path plus the OnHold↔InProgress pause and the Resolved→Open reopen explicitly, and calls the remaining direct-to-Resolved/Closed shortcuts (and OnHold's direct path back to Open) out as a note rather than drawing a dozen crossing arrows — legible over exhaustive.

### Why `OnHold` matters beyond pausing work
Pausing pushes both the response-due and resolution-due timestamps forward by exactly how long the pause lasted, rather than tracking a separate "elapsed active time" counter — see diagram 8 for the exact mechanism.

### A claim that needed correcting
The frontend keeps its own copy of the transition rules (`frontend/src/features/tickets/transitions.ts`) purely as documentation and UI convenience — never as the actual enforcement, which is entirely server-side (diagram 1's RBAC/validation layer, and diagram 11's transition check). That frontend copy is **not** diffed against or derived from the backend's source file at build or test time; it's a hand-maintained literal mirror with its own test asserting its own contents match what a developer typed. If the backend's transition rules change, the frontend copy only stays correct if a person updates both — there's no automated cross-check that would catch drift.

### Key takeaway
This state machine is enforced on the backend; the frontend's copy is a convenience layer that can drift if not maintained by hand, not a build-time guarantee of parity.

---

## 6. Authentication & Refresh Token Flow
**File:** `06-auth-refresh-flow.png` / `06-auth-refresh-flow.mmd`

### What it shows
One full authentication cycle: login, an expired access token, a refresh, the two possible outcomes of that refresh, and logout.

### Password verification happens in Node, not the database
The login step is drawn as two messages rather than one: the backend loads the user row (including `passwordHash`) from PostgreSQL, and **Node/Nest itself** calls `argon2.verify()` against that hash — the database never performs any part of the verification. It also has a timing-safe dummy-hash verify path on an unknown email, so a login attempt against a nonexistent account takes the same shape as one against a real account.

### The two tokens, and why they're treated so differently
- The **access token** is short-lived, returned in the response body, and held only in the browser's memory — never written to `localStorage`, `sessionStorage`, or a script-readable cookie.
- The **refresh token** is longer-lived and travels exclusively inside a cookie that is `httpOnly`, `Secure` (in production; not in local dev, correctly environment-dependent), `SameSite=Strict`, and scoped to the path `/api/v1/auth`.

### The rotation-and-reuse mechanism
The refresh endpoint wraps validate-then-rotate in one atomic database transaction, and additionally checks that the request's `Origin` header matches its `Host` before touching the database (`assertTrustedOrigin()`) — a defense-in-depth check on top of `SameSite=Strict`. If an already-rotated token is presented again, the system revokes the user's **entire token family**, not just the reused token. A legitimate user simply logs in again; an attacker who stole a token loses it the moment the real user's browser uses its own (rotated) copy first. Logout revokes only the one presented token, and is a silent no-op if the cookie is already unknown or revoked.

### The cross-tab race, confirmed real
"Two tabs racing a refresh is handled by client-side locking" is not a hypothetical in the code: `frontend/src/lib/api/client.ts` genuinely uses `navigator.locks` (with an in-memory fallback for browsers without it, and its own dedicated tests) to serialize refresh attempts across tabs, so a second legitimate tab never triggers the reuse/theft path.

### Key takeaway
Nothing here is exotic cryptography — it's ordinary JWT-plus-refresh-cookie design, with each failure mode (XSS token theft, replay, concurrent-tab races, CSRF-style origin spoofing) closed by a specific, verifiable mechanism.

---

## 7. Roles & Access Model
**File:** `07-rbac-access-model.png` / `07-rbac-access-model.mmd`

### What it shows
Four fixed roles — Employee, Support Agent, Team Lead, Administrator — drawn as a left-to-right ladder where each tier adds a specific capability on top of the last.

### "Cumulative," precisely
Effective access *is* cumulative in practice — reading left to right, each role can do everything the previous one could, plus more — but that's an **emergent property of independent, per-route role-list constants that happen to nest** (`STAFF_ROLES = [SupportAgent, TeamLead, Administrator]`, the narrower `ANALYTICS_AGENT_ROLES = [TeamLead, Administrator]`, and `AUDIT_READ_ROLES = [Administrator]`), not a coded inheritance chain or a dynamic permissions engine. Reading the tiers:
- **Employee** (baseline): create/view own tickets and comment, view assets currently assigned to them, read published KB articles.
- **+ Support Agent**: view/triage *every* ticket, internal notes and full history, asset management, KB authoring, the SLA dashboard, and the AI assistant panel (all gated by `STAFF_ROLES`).
- **+ Team Lead**: per-agent performance analytics only — the one capability specifically about evaluating people, gated more narrowly than the rest of the staff feature set.
- **+ Administrator**: the user directory and the audit log — the two views that expose every account's email and every user's recorded actions.

### The closing note is the most important part of the diagram
Every rule is enforced on the backend twice, independently: once by `RolesGuard` at the route level, and again by row-level ownership/visibility checks inside the service (confirmed in `tickets.service.ts` — e.g. a non-staff requester is blocked from most transitions once a ticket leaves `New`, and internal-visibility comments are hidden from non-staff, non-requester callers). The frontend's role-aware UI is a convenience layer, never the security boundary.

### Key takeaway
A role is a fixed enum with four values (`Employee | SupportAgent | TeamLead | Administrator`), not a dynamic permissions table — simple by design, with cumulative access arising from how the route-level role lists happen to be composed.

---

## 8. SLA Clock Lifecycle
**File:** `08-sla-lifecycle.png` / `08-sla-lifecycle.mmd`

### What it shows
The life of a ticket's two SLA clocks — response and resolution — from creation through pausing, resuming, completion, and reopening, and the real state model each clock exposes.

### Why the state model isn't a flat "Met / At risk / Breached"
Each clock's state is one of a richer set of live values while it hasn't completed — `Running` (on track), `AtRisk` (at or below 20% of its target time remaining), `Paused` (while the ticket is On Hold), and, for the response clock specifically, `NoResponse` — all **recomputed on every read and never persisted** while the clock is still open. Once a clock *completes* (the first staff reply for the response clock; `ticket.resolvedAt` being set — via `→ Resolved` or a direct `→ Closed` — for the resolution clock), whatever state it was in at that instant freezes **permanently** into `Met` or `Breached`, and is never re-evaluated afterward. Collapsing this to three flat states would hide the live/completed distinction the backend actually implements.

### The policy snapshot
`responseTargetMinutes`/`resolutionTargetMinutes` (and the corresponding due-at timestamps) are copied onto the ticket's `TicketSla` row at creation time from the active `SlaPolicy` for its priority. Editing the policy later never rewrites targets already committed to an in-flight ticket.

### Pause and resume, in exact terms
Going `OnHold` records `onHoldStartedAt = now()` using the **database's** clock — due dates are *not* shifted at the moment of pausing. Resuming applies a pure additive SQL shift, `due_at += (now() − onHoldStartedAt)`, for both clocks; a `totalPausedMinutes` figure is also accumulated for display, but it's not the mechanism that protects the due date — the due-date shift is.

### Reopening reuses the same mechanism, anchored to the same clock
When a resolved ticket reopens, time spent "resolved" is credited back to the resolution clock via the identical resume mechanism — confirmed anchored to the **database's** clock throughout, not the application server's, which matters because any drift between the two clocks would otherwise corrupt the credited time. An already-completed response clock is not reopened by this — it stays completed.

### The breach decision
A clock is `Breached` once its due date has passed while it's still running — and if it hasn't yet completed by then, it stays `Breached` (it can't un-breach) until it completes and that becomes the permanent, persisted outcome.

### Key takeaway
The backend's `responseState`/`resolutionState` values are always authoritative. The frontend never re-derives them — it only locally ages the backend's `minutesRemaining` between refetches, which can shrink toward "due now" but can never flip a state on its own.

---

## 9. CI/CD Pipeline
**File:** `09-cicd-pipeline.png` / `09-cicd-pipeline.mmd`

### What it shows
Five independent GitHub Actions jobs triggered on every push — Frontend, Backend, Browser E2E, Dependency Audit, and Container Images.

### What each job verifies
- **Frontend** — typecheck, eslint, the full Vitest unit/component suite, production build.
- **Backend** — against a real ephemeral `postgres:16-alpine` service: `prisma validate` → `migrate deploy` → `migrate status` (a drift check, catching a schema edited without a matching migration) → seed → typecheck → eslint → unit tests → API e2e tests → build.
- **Browser E2E** — builds and boots the *compiled* API (`dist/main`, not the dev server), polls its `/api/v1/health` endpoint until it answers, then runs Playwright against the real, running frontend and backend together.
- **Dependency Audit** — `npm audit --omit=dev --audit-level=high` against both the backend and frontend, failing on any high-or-critical finding.
- **Container Images** — builds all three production images (backend `runtime`, backend `migrator`, frontend `runtime`), validates the full `docker compose config`, and syntax-checks `nginx.conf` by running `nginx -t` inside a standalone `nginx:1.27-alpine` container with `default.conf` removed and `--add-host backend:127.0.0.1` supplied so the check's static DNS resolution for `proxy_pass` succeeds without the other containers actually running. This is the only place in the project where these images get built and proven to work — Docker isn't installed on the machine the project is developed on (see diagram 10).

### The gate, and what actually happened during early CI runs
All five jobs passing is **the project's release/merge acceptance criterion** — GitHub branch-protection status was not independently verified as part of this review, so this is stated as the project's own bar rather than as a claim about a technically enforced merge gate. The pipeline's first pushes did fail and get fixed in a short debugging window on 2026-09-22, but **that window was not nginx-only**: one of the fix commits (`7e8346f`) bundles a genuine frontend bug fix — a test `QueryClient` that didn't match production's `refetchOnWindowFocus: false`, causing an extra network request via React Query's shared focus-manager in jsdom — together with nginx error-surfacing, and a separate commit (`3488d0f`) resolves the actual nginx issue (the standalone `nginx -t` check couldn't resolve the `backend` upstream hostname via DNS, fixed with `--add-host`).

### Key takeaway
This pipeline is the same checks a developer is expected to run locally before committing, re-run automatically on every push against a real, ephemeral environment rather than a mock one.

---

## 10. Runtime / Deployment Topology
**File:** `10-runtime-deployment-topology.png` / `10-runtime-deployment-topology.mmd`

### Purpose
Diagram 1 explains the *logical* architecture; this one answers a different question — **how does OpsNow physically run**, in the two environments that actually exist today. It does not claim any real hosting, registry, or domain, because none exists (see `docs/deployment.md`).

### What it shows — development
The browser talks to the Vite dev server on `:5173`, whose proxy rule forwards `/api` to `http://localhost:3000` with **no** `changeOrigin` and **no** path rewrite (both deliberate, per the config file's own comments) — NestJS runs directly on `:3000` via `nest start --watch`, against a developer-run, non-containerized PostgreSQL on `:5432`. A real trap worth documenting: `vite preview` (`:4173`) needs its own separate `preview.proxy` entry — it doesn't inherit the dev-server's proxy config automatically.

### What it shows — container/runtime
Four services defined in `docker-compose.yml`: a `postgres:16-alpine` container (published only to `127.0.0.1:5433`, i.e. loopback-only, with a named volume for persistence and a `pg_isready` healthcheck); a one-shot `migrate` container (`backend/Dockerfile`, target `migrator`, runs `prisma migrate deploy` then exits, `restart: 'no'`); a `backend` container (target `runtime`) that is **not published to the host at all** — reachable only inside the Docker network — with a healthcheck that hits its own `/api/v1/health` (which also pings the database); and a `frontend` container (nginx, target `runtime`) published at `8080 → 80`, serving the built SPA and reverse-proxying `/api` to `http://backend:3000`. `depends_on` conditions chain correctly: frontend waits on backend being healthy, backend waits on postgres being healthy *and* migrate having completed successfully.

### Same-origin, again, in this environment
nginx plays exactly the role Vite's proxy plays in development — the backend is never dual-published or reachable at a second, cross-origin address in either environment, which is what keeps the refresh-cookie design in diagram 6 valid in both.

### What has and hasn't actually happened
This entire container topology is exactly what `.github/workflows/ci.yml` builds and validates on every push (`docker compose config`, `nginx -t`) — confirmed passing repeatedly. What has **not** happened: Docker is not installed on this development machine, so this stack has never been started with a real local `docker compose up`, and there is no cloud deployment anywhere. This diagram documents the *configured, CI-validated* topology, not an observed running system.

### Simplifications
Environment variable values are omitted deliberately (only names/purposes are shown) — see `.env.example` files and `docs/deployment.md` for the authoritative list, including which ones have no default and will fail the stack fast if unset (`JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD`).

---

## 11. Ticket Update & Concurrency Flow
**File:** `11-ticket-update-concurrency-flow.png` / `11-ticket-update-concurrency-flow.mmd`

### Purpose
Diagram 5 shows *which* status transitions are legal; this one shows the full engineering path a `PATCH /tickets/:id` request actually takes, and the guarantees around it — authorization, validation, optimistic concurrency, atomic history, and conditional SLA integration.

### The concurrency mechanism — not a version column
There is **no `version` field on `Ticket`**. Instead, each mutating operation uses a **targeted compare-and-swap predicate on the specific field it just read**, inside a `ticket.updateMany` call also scoped by `ticketVisibilityWhere(user)`:
- plain field edits (subject/description/category) — CAS on `updatedAt`
- assignment — CAS on `assigneeId`
- priority change — CAS on `priority`
- a status transition — CAS on `status`

If the predicate matches zero rows (`updateMany` count ≠ 1), someone else changed that exact field first — the request throws a `ConflictException` (`409`, "Ticket was modified by another request; reload and retry") rather than silently overwriting.

### The full flow
`JwtAuthGuard` (401 on failure) → `getVisibleTicketOrThrow` — an RBAC- and row-level-visibility-scoped read (404 if the ticket doesn't exist or isn't visible to this caller) → a role/ownership check (403 if it fails — e.g. a non-staff requester acting outside their one allowed self-service transition) → request validation (400 on a malformed body) → for a status change, a check against the transition matrix from diagram 5 (**403**, not 400, for a matrix-disallowed transition; 400 specifically for the no-op "already in that status" case) → the CAS `updateMany` described above, all inside one Prisma `$transaction` → a conditional SLA side effect (**only** for operations that actually affect a clock: entering/leaving `OnHold`, resolution, reopen, or a priority change — a plain subject/description edit triggers none) → a `TicketHistory` row write, in the **same transaction and commit** as the ticket update itself (history is not written outside the atomic boundary) → commit. `AuditService.record(...)` is called **after** the transaction commits, deliberately **outside** it, specifically because `AuditService` never throws — a failed audit write can't fail or silently undo an already-committed ticket update.

### Failure branches, exactly as implemented
`401` unauthenticated · `404` ticket not found or out of visibility scope · `403` failed ownership/role check **or** a transition the matrix disallows · `400` malformed request body **or** a no-op status change · `409` CAS conflict. Underlying Prisma errors are mapped rather than left raw: `P2003` (foreign-key violation) → `400`, `P2025` (record not found) → `404`. There is no separate generic "transaction failure" branch beyond these.

### Simplifications
The diagram folds "role/ownership check" and "transition-matrix check" into two decision points for readability; in the source they're evaluated as part of the same service method rather than as physically separate middleware stages.

---

## Regenerating these diagrams

Each numbered diagram has a matching `.mmd` Mermaid source file. All eleven were rendered with `@mermaid-js/mermaid-cli` (`mmdc`) using the shared theme in `.mermaid-theme.json` (a custom indigo/lavender `base` theme — this is what gives every diagram its consistent look) and the sandboxing flags in `.puppeteer-config.json`:

```
npx --yes -p @mermaid-js/mermaid-cli mmdc -i <name>.mmd -o <name>.png -c .mermaid-theme.json -p .puppeteer-config.json -b white -s 2
```

If the application changes in a way that affects one of these diagrams, edit the `.mmd` source and re-render — don't hand-edit the PNG. This folder's diagrams were cross-checked directly against `backend/prisma/schema.prisma`, the NestJS controllers/services/guards, the ticket transition constants and their tests, the SLA service, `.github/workflows/ci.yml`, the Dockerfiles/`docker-compose.yml`/nginx config, `vite.config.ts`, and the project's ADRs in `DECISIONS.md` — not drawn freehand — and should be re-checked the same way if the underlying code changes, so they don't quietly drift out of sync with what the application actually does.
