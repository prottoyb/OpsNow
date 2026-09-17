# OpsNow

A full-stack IT Service Management (ITSM) platform, built to demonstrate
professional software engineering practice across the frontend, backend,
database and testing layers of a realistic internal IT support system.

## Project Overview

OpsNow simulates the core of an internal IT help-desk: employees raise
tickets, support staff triage and resolve them against SLA targets, and
IT assets are tracked and assigned to the people using them. It is built
as a portfolio project — the goal is not to ship every feature a real
ITSM product would eventually need, but to build a meaningful subset of
one **completely and correctly**, with the same rigor (data modeling,
access control, concurrency safety, test coverage, review) a production
system would require.

## What OpsNow Is

- A **separated frontend/backend web application**: a React SPA talking
  to a versioned NestJS REST API over HTTP.
- A **role-aware workflow tool**: the same ticket, SLA and asset data is
  presented differently depending on whether the viewer is an employee
  raising an issue or a staff member handling it — and that distinction
  is enforced on the server, not just hidden in the UI.
- A **incrementally built system**, developed and reviewed one phase at
  a time, with every phase's decisions recorded in `DECISIONS.md` and
  every phase's status tracked in `TASKS.md`/`progress.md`.

## Current Project Status

**Phases 0–8b are complete.** Phase 9 (Knowledge Base) is the next phase
and has **not** been started — no knowledge-base code exists yet beyond
the Phase 2 database schema for it.

Completed so far:

- Project foundation and an approved architecture, recorded as ADR-001
  through ADR-021 in `DECISIONS.md`.
- A PostgreSQL database with Prisma as the schema/migration source of
  truth (18 tables, 7 enums, including tables reserved for not-yet-built
  phases such as Knowledge Base, Notifications and Audit Log).
- A NestJS backend foundation (config validation, global error handling,
  Swagger/OpenAPI documentation, a database-backed health check).
- Authentication: registration, login, JWT access tokens, rotating
  httpOnly refresh tokens, logout, and reuse/theft detection.
- Backend RBAC across four fixed roles, enforced globally by default-deny
  guards.
- Ticket management: full backend REST API and a matching frontend UI
  (list, create, detail, assignment, status/priority transitions,
  comments/internal notes, history).
- SLA management: backend calculation engine (response/resolution
  clocks, pause/resume, breach/at-risk detection) and a frontend that
  surfaces it on the ticket list, ticket detail, and a staff-only
  dashboard.
- Asset management: backend REST API (assets, asset types, an
  assignment ledger, ticket↔asset links) and a matching frontend UI.
- Role-aware employee/staff interfaces throughout the above features.
- Unit, component and end-to-end (Playwright) test coverage for every
  completed area.
- Swagger/OpenAPI documentation for every implemented backend endpoint.

## What Remains to Be Built

The phases below are planned (see `TASKS.md` for the authoritative,
task-level breakdown) but not yet implemented. Nothing described here
exists in the running application today:

- **Phase 9 — Knowledge Base**: article authoring, categorization,
  search/filtering, feedback, and linking articles to tickets.
- **Phase 10 — Dashboard & Analytics**: cross-cutting ticket/SLA/agent
  metrics and management-facing reporting, beyond the SLA dashboard that
  already exists.
- **Phase 11 — Audit Logging**: a user-facing audit trail. The `AuditLog`
  table exists in the schema; nothing writes to or reads from it yet.
- **Phase 12 — AI Ticket Assistant**: an explicitly optional, isolated
  feature (ADR-011) — category/priority suggestions, response drafting,
  resolution summaries. Not started.
- **Phase 13 — Testing & Quality**: a dedicated cross-cutting hardening
  pass, on top of the per-phase test suites that already exist.
- **Phase 14 — Docker**: containerization of the frontend, backend and
  database. There is currently no Dockerfile or Compose configuration.
- **Phase 15 — CI/CD**: a GitHub Actions pipeline. There is currently no
  CI configuration; checks are run locally.
- **Phase 16 — Deployment**: production environment, secrets and CORS
  configuration, and a deployed instance.
- **Phase 17 — Final Review & Portfolio Preparation**: final polish,
  diagrams, and demo preparation.

Two smaller, explicitly tracked deferrals also remain open (see
`TASKS.md`): rate limiting on `/auth/login` and `/auth/register` (must be
closed before any public deployment), and a staff-visible user directory
endpoint that would let staff assign tickets/assets to a specific
colleague rather than only to themselves.

## What the Finished System Is Intended to Provide

A small but coherent ITSM product: employees can raise and track issues
and see the equipment assigned to them; support staff can triage,
resolve and hand off tickets within SLA, search a knowledge base before
escalating, and manage the asset lifecycle; team leads and administrators
get visibility into SLA performance and operational metrics. The emphasis
throughout is on correctness and access control being genuinely enforced
server-side, not on feature breadth for its own sake.

## Technology Stack

**Frontend**
- React 19 + TypeScript, built with Vite
- React Router (routing)
- TanStack Query (server state, caching, request lifecycle)
- Tailwind CSS v4
- Native `fetch` — no HTTP client library, no global state library, no
  form library, no component library (ADR-002/008/016/017)

**Backend**
- Node.js + NestJS (TypeScript), REST API versioned under `/api/v1`
- Prisma as the schema/migration source of truth over PostgreSQL
- `class-validator`/`class-transformer` for request validation
- Passport JWT strategy for authentication
- Argon2id for password hashing
- Swagger/OpenAPI for API documentation (`/api/docs`)

**Database**
- PostgreSQL, UUID primary keys, Prisma migrations

**Testing**
- Jest + Supertest (backend unit + e2e, against a real local Postgres)
- Vitest + Testing Library (frontend unit/component)
- Playwright (end-to-end, against the real running stack)

**Infrastructure**
- Docker and GitHub Actions are planned (Phases 14–15) but not yet
  present in the repository.

## System Architecture

OpsNow is a conventional two-tier web application: a React single-page
app calling a versioned NestJS REST API, backed by a single PostgreSQL
database. There is deliberately no microservices split, no message
queue, and no monorepo tooling (ADR-001/017) — the project's complexity
budget is spent on correctness inside each layer (access control,
concurrency, SLA math) rather than on distributed-systems concerns a
project at this scale doesn't need.

In local development the frontend proxies API requests through Vite so
the app and API share an origin — this isn't a convenience, it's load
bearing: the backend enables no CORS, rejects a cross-origin `Origin`
header on `/auth/refresh` and `/auth/logout`, and issues a
`SameSite=Strict` refresh cookie, so authentication only works when the
API appears same-origin to the browser.

## Frontend Architecture

The frontend is a standalone Vite/React/TypeScript app under `frontend/`,
organized by feature (`src/features/{auth,tickets,sla,assets}`) rather
than by technical layer, with shared UI primitives, API/query
infrastructure and app-shell routing kept separate (`src/components`,
`src/lib`, `src/app`).

Key decisions:

- **Auth state lives in memory, not storage.** The access token is held
  in a React context and never written to `localStorage`/`sessionStorage`.
  The refresh token lives only in an httpOnly cookie the frontend never
  reads. A page reload recovers the session via a bootstrap refresh call.
- **Refresh-on-401 is single-flight and cross-tab serialized** (via
  `navigator.locks`, with a same-tab fallback). This isn't decoration —
  presenting an already-rotated refresh token causes the backend to
  revoke the user's entire token family as suspected theft, so two tabs
  racing a refresh is a real failure mode, not a theoretical one.
- **Role-aware UI is presentation only.** Every gated action still has a
  working backend 403 path behind it; hiding a button is a UX nicety, not
  the security boundary (ADR-006/018).
- **Status transitions are pinned to the backend's transition matrix** by
  an exact-contents test, so if the backend's allowed transitions ever
  change, the frontend's test fails loudly instead of silently offering
  an action the server will reject.
- **SLA countdowns never re-derive state client-side.** The backend's
  `responseState`/`resolutionState` strings are authoritative; the
  frontend only ages the backend's own `minutesRemaining` figure locally
  between polls (ADR-021).
- A repository-wide guard test suite fails the build on
  `dangerouslySetInnerHTML`, `eval`/`Function()`, string-form timers, and
  any use of web storage — enforced mechanically, not by convention.

## Backend Architecture

The backend is a modular NestJS application under `backend/src`, with one
module per resource (`auth`, `users`, `tickets`, `sla`, `assets`,
`asset-types`, `ticket-categories`, `health`), each with its own
service/controller/DTOs. There is no separate repository/entity layer —
Prisma's generated client *is* the data-access layer, and services talk
to it directly (consistent with ADR-014's "Prisma as the ORM" decision
and the project's stated preference against unnecessary abstraction).

Cross-cutting concerns are handled globally rather than per-route:

- A global `ValidationPipe` (whitelist, `forbidNonWhitelisted`, transform)
  rejects unexpected fields on every request.
- A global `AllExceptionsFilter` returns a consistent error shape and
  never leaks a stack trace to the client.
- Two global guards run on every request: `JwtAuthGuard` (default-deny —
  every route requires a valid access token unless explicitly marked
  `@Public()`, ADR-018) and `RolesGuard` (enforces `@Roles(...)`
  annotations, fails closed on an empty role list).
- Row-level visibility (which tickets/assets a caller may see at all) is
  enforced by shared service-layer helpers (`ticketVisibilityWhere`,
  `asset-visibility.ts`), applied consistently to every read and to the
  `where` clause of every write — not left to a per-controller check.

## Database Architecture

PostgreSQL with Prisma as the schema and migration source of truth.
UUID primary keys throughout. The schema currently defines 18 tables and
7 enums, including several (knowledge base, notifications, audit log)
that exist to support not-yet-built phases but have no application code
using them yet.

Notable modeling decisions:
- Soft deletes (`deletedAt`) rather than hard deletes on entities that
  need history to remain meaningful after removal (e.g. `User`, `Asset`).
- PostgreSQL-specific constructs Prisma can't express declaratively are
  added by hand in the migration: CHECK constraints (e.g. a ticket can't
  be `Closed` without `resolvedAt` set), partial/filtered unique indexes
  (e.g. at most one open assignment per asset), and a generated `tsvector`
  column with a GIN index for future knowledge-base full-text search.
- `TicketHistory` and `AssetAssignment` are append-only ledgers, not
  mutable status fields — see Ticket-Management and Asset-Management
  sections below.

## Authentication and Authorization

- **Passwords**: hashed with Argon2id.
- **Access tokens**: short-lived JWTs, validated by a Passport JWT
  strategy, held only in frontend memory.
- **Refresh tokens**: opaque random values, SHA-256 hashed before
  storage, delivered only via an httpOnly, `SameSite=Strict`,
  path-scoped cookie — never readable by JavaScript.
- **Rotation and reuse protection**: every refresh issues a new token and
  atomically invalidates the old one (a conditional update inside a DB
  transaction, so concurrent requests for the same token can't both
  succeed). Presenting an already-rotated token is treated as suspected
  theft and revokes the user's entire active-token family, not just that
  one token.
- **Timing-safe login**: an unknown email still runs a real Argon2 verify
  against a dummy hash, so response timing doesn't reveal whether an
  account exists.
- **Authorization (RBAC)**: four fixed roles — `Employee`, `SupportAgent`,
  `TeamLead`, `Administrator` — enforced by a globally-registered
  `RolesGuard`, not a per-route opt-in. Roles are a fixed enum rather than
  a dynamic permissions table (ADR-006); finer-grained permissions were
  deliberately deferred until there's a concrete need for them.
- **Default-deny by design**: every route requires authentication unless
  explicitly marked `@Public()` (ADR-018), so a forgotten guard fails
  closed instead of open.
- **Known, tracked gap**: `/auth/login` and `/auth/register` have no
  rate limiting yet. This is a documented deferral, not an oversight, and
  must be closed before any public-facing deployment.

## Ticket-Management Workflow

Tickets are the core workflow object: created by an employee, triaged and
worked by support staff, and closed against an SLA. Key behaviors:

- **Visibility**: employees see only their own tickets; staff see all.
  A ticket outside a caller's scope (wrong owner, or soft-deleted) is a
  404 everywhere, not a 403 — the same "safe not found" pattern used
  consistently across the app so scoping bugs can't leak existence.
- **State machine**: status changes go through an explicit transition
  matrix rather than a free-form field. `Closed` is terminal for every
  role, including Administrator; only `Resolved → Open` reopens a
  ticket, which clears `resolvedAt`/`closedAt` and increments a
  `reopenedCount`.
- **Concurrency**: assignment and status changes use an optimistic
  compare-and-swap (a conditional update gated on the row's current
  state) — a losing concurrent request gets a clean `409 Conflict`
  instead of silently overwriting another change.
- **History**: every meaningful change (assignment, status, priority,
  comments) writes an immutable `TicketHistory` row in the same
  transaction as the change itself, so history and state can never drift
  apart. History is staff-only, including from the ticket's own
  requester.
- **Comments**: public comments are visible to the requester; internal
  notes are staff-only and are excluded from both the returned rows *and*
  the pagination total for an employee, so their existence isn't leaked
  by a count either.

## SLA Design and Behaviour

Each ticket gets two independent SLA clocks — **response** and
**resolution** — sized from a policy snapshotted onto the ticket at
creation time, so a later change to the policy table never rewrites an
in-flight ticket's targets (see ADR-020 for the full design).

- **Pause/resume**: putting a ticket `OnHold` pauses both clocks by
  shifting their due dates forward by the paused duration when work
  resumes, rather than tracking elapsed time separately.
- **Reopen pause-credit**: reopening a resolved ticket reuses the same
  pause-credit mechanism, crediting the time the ticket spent "resolved"
  back into the clock, anchored to the database's own clock (not the
  application's) to avoid clock-skew corruption.
- **Breach/at-risk detection**: a response recorded while paused is
  judged against whether the pause itself started after the due date had
  already passed — not against the reply's own timestamp — to avoid
  mis-recording a genuinely on-time response as breached.
- **Priority changes**: shift SLA due dates by the delta between the old
  and new policy, but are skipped entirely once a ticket has resolved at
  least once, so a priority edit can't retroactively shift a completed
  clock.
- **Frontend rendering**: the backend's state strings
  (`responseState`/`resolutionState`) are authoritative and never
  re-derived in the browser. The visible countdown ages the backend's own
  `minutesRemaining` from a locally captured instant; paused and finished
  clocks don't tick; nothing refetches when a countdown reaches zero.
  A staff-only dashboard (`/sla`) surfaces aggregate metrics and the
  active policy table.

## Asset-Management Design and Behaviour

Assets (laptops, monitors, phones, etc.) are tracked with a status,
an optional current holder, and a full assignment history.

- **The assignment ledger *is* the history** — there is no separate audit
  table. `AssetAssignment` rows are append-only, and `PATCH
  /assets/:id/assignment` is the single seam every assignment change
  funnels through, so `status` and `currentAssigneeId` can never drift
  out of sync with the ledger behind the scenes.
- **Visibility**: an employee sees only assets currently assigned to
  them; staff see all assets. As with tickets, an out-of-scope or
  soft-deleted asset is a 404, not a 403.
- **Concurrency**: assignment changes use the same compare-and-swap
  pattern as ticket assignment — verified under real concurrent load to
  produce exactly one winner and one consistent open ledger row, not just
  asserted in a unit test.
- **Ticket linking**: assets can be linked to the tickets they relate to.
  A ticket's linked-assets view intentionally returns a narrow summary
  (id, tag, name, status, type) for every role, rather than the full
  asset record, so an employee who can see a ticket can't use it to read
  a colleague's full asset detail.
- **Deliberately out of scope for now**: there is no assignee picker —
  `GET /api/v1/users` is Administrator-only, so staff can only "assign to
  me," "assign to the ticket's requester," or "return to stock." A
  general staff directory endpoint would be needed before a fuller
  assignment UI makes sense.

## Testing and Quality Strategy

Every completed phase carries its own test coverage, added alongside the
feature rather than after it:

- **Backend**: Jest unit tests for services/guards/pure logic, plus a
  Supertest e2e suite (7 spec files) run against a real local PostgreSQL
  database — not mocks — covering the full role grid for every endpoint.
- **Frontend**: Vitest + Testing Library component/unit tests, including
  a repository-wide guard suite that fails the build on unsafe DOM
  patterns or storage use.
- **End-to-end**: Playwright specs (`frontend/e2e/`) drive the real
  running frontend against the real running backend and database for the
  ticket, SLA and asset workflows, including a cross-role journey (an
  employee and a staff member in separate browser contexts, since the
  refresh cookie is httpOnly).
- **Test data isolation**: the e2e/Playwright suites never seed, reset,
  or wipe the shared local database. Every row a test creates is tagged
  (e.g. an `[E2E]`/`E2E-` subject/tag prefix), assertions are scoped to
  that tagged data, and teardown deletes only what was tagged — a crashed
  run self-heals on the next one instead of leaving orphaned data or
  requiring a manual reset.
- **Concurrency claims are verified, not just asserted**: race-sensitive
  logic (ticket/asset assignment CAS) has been exercised under genuinely
  concurrent requests and confirmed to produce exactly one winner, in
  addition to the deterministic unit tests that mock a lost race.

Every feature phase also went through an independent QA/Security review
and a separate Senior Review before being considered complete — see
`progress.md` for the specific findings and fixes recorded per phase.

## Security Considerations

- Backend-enforced RBAC and row-level visibility on every resource — the
  frontend's role-aware UI is a convenience layer only.
- Passwords hashed with Argon2id; refresh tokens hashed (SHA-256) before
  storage; access tokens are short-lived; refresh tokens rotate on every
  use with theft/reuse detection.
- httpOnly, `SameSite=Strict` refresh cookie; no auth token of any kind
  is ever written to browser storage.
- Global input validation rejects unexpected fields and unlisted
  properties on every request; a global exception filter guarantees no
  stack trace or internal detail reaches a client response.
- Consistent 404-for-out-of-scope responses prevent resource existence
  from leaking through a 403.
- `npm audit` is run and kept at 0 vulnerabilities as dependencies are
  added; transitive vulnerable versions have been pinned via
  `overrides` rather than ignored.
- **Known, tracked gap**: no rate limiting yet on `/auth/login` or
  `/auth/register`, and Swagger UI (`/api/docs`) is currently mounted
  unauthenticated in every environment — both flagged for resolution
  before any public deployment (Phase 16).

## Repository Structure

```
OpsNow/
├── backend/               NestJS API (TypeScript)
│   ├── prisma/             Schema, migrations, seed data
│   ├── src/                 One module per resource (auth, users,
│   │                        tickets, sla, assets, asset-types,
│   │                        ticket-categories, health, common, config)
│   └── test/                 Supertest e2e specs, real-DB cleanup scripts
├── frontend/               React SPA (TypeScript, Vite)
│   ├── src/
│   │   ├── app/               Routing, layout, providers
│   │   ├── features/          auth, tickets, sla, assets
│   │   ├── components/         Shared UI primitives
│   │   └── lib/                 API client, query infrastructure
│   └── e2e/                  Playwright specs
├── docs/                   Reserved for architecture/API docs (currently empty)
├── database/               Reserved for standalone DB assets (currently empty)
├── .claude/                Structured AI-development workflow (see below)
├── TASKS.md                Phase-by-phase task checklist (source of truth for status)
├── progress.md             Full development log, phase by phase
├── DECISIONS.md            Architecture Decision Records (ADR-001…ADR-021)
└── CLAUDE.md               Project-specific development instructions
```

## Local Development Setup

Prerequisites: Node.js 22+, a local PostgreSQL instance, and an
`opsnow_dev` database. Copy `backend/.env.example` to `backend/.env` and
fill in real local values.

**Backend** (http://localhost:3000, API under `/api/v1`, Swagger at
`/api/docs`):

```
cd backend
npm install
npx prisma migrate deploy
npm run prisma:seed      # WARNING: wipes and rebuilds all data
npm run start:dev
```

**Frontend** (http://localhost:5173):

```
cd frontend
npm install
npm run dev
```

Run the frontend through Vite rather than opening a static build
directly — the dev proxy is what makes the app and API share an origin,
which authentication depends on (see System Architecture above).

**Testing:**

```
cd backend  && npm test && npm run test:e2e   # Jest + Supertest
cd frontend && npm test                        # Vitest + Testing Library
cd frontend && npx playwright test             # end-to-end
```

The backend e2e and Playwright suites run against the real local
database. They create only tagged data, assert only on that data, and
clean up only what they created. `[E2E]`/`E2E-` are reserved
subject/tag prefixes used by test teardown — don't use them for real
tickets or assets.

## Current Roadmap

See `TASKS.md` for the authoritative, task-level breakdown. In order:

1. **Phase 9 — Knowledge Base** (next)
2. Phase 10 — Dashboard & Analytics
3. Phase 11 — Audit Logging
4. Phase 12 — AI Ticket Assistant (optional/isolated, per ADR-011)
5. Phase 13 — Testing & Quality hardening
6. Phase 14 — Docker
7. Phase 15 — CI/CD
8. Phase 16 — Deployment
9. Phase 17 — Final Review & Portfolio Preparation

## Engineering Decisions / Design Principles

Every non-trivial technical decision is recorded as a numbered Architecture
Decision Record in `DECISIONS.md` (currently ADR-001 through ADR-021),
covering — among others — the frontend/backend split, ORM choice, primary
key strategy, authentication and authorization design, default-deny route
protection, the ticket state machine, and the SLA calculation model. A few
principles run through all of them:

- **Build incrementally, in independently verifiable phases.** Each phase
  is planned, implemented, reviewed and recorded before the next begins.
- **Prefer the simplest architecture that's actually correct.** No
  microservices, no policy engine, no permissions table, no state
  library — until there's a concrete reason for one. Several ADRs
  explicitly note where a more complex option was considered and
  rejected as premature.
- **Security is enforced on the backend, always.** Role-aware UI exists
  for usability, never as the actual boundary.
- **Don't drop known gaps silently.** Deferred work (rate limiting, a
  staff directory endpoint, a few cosmetic history-rendering gaps) is
  explicitly tracked in `TASKS.md`, not abandoned or forgotten.

## AI-Assisted Development Workflow

OpsNow is built using a structured Claude Code agentic development
workflow for engineering tasks — implementation, independent QA/security
review, and senior code review are handled by distinct, specialized
roles rather than a single undifferentiated pass. This is a development
practice, not a product feature; nothing about it is exposed to end
users of the application itself.

The supporting structure lives under `.claude/`:

- **`.claude/agents`** — specialized role definitions (e.g. a
  fullstack-engineer role for implementation, separate QA/security and
  senior-reviewer roles for independent review, a software-architect role
  for upfront design review).
- **`.claude/rules`** — shared engineering, security, testing and
  documentation rules that apply consistently across roles and phases.
- **`.claude/skills`** — reusable workflows for recurring processes such
  as feature development and security review.
- **`.claude/agent-memory`** — persisted, per-role notes that carry
  context forward between sessions, so review standards stay consistent
  phase over phase.

In practice, every completed phase in this repository went through this
same cycle: an implementation pass, followed by independent QA/security
and senior review against the real running code, with findings fixed (or
explicitly deferred and tracked) before the phase was marked complete.
The engineering substance of the result — the architecture, the access
control, the concurrency handling, the tests — is the point; the workflow
is what kept it consistent across ~20 phases of work.

## Project Maturity / Portfolio Status

OpsNow is a **substantial, working ITSM portfolio system under active
development**, not a finished or production-deployed product. As of this
checkpoint (Phase 8b complete, Phase 9 next):

- Core ticket, SLA, and asset workflows are complete end to end — backend
  API, frontend UI, and test coverage — and have been exercised against
  a real database and a real running server, not just unit-tested in
  isolation.
- Authentication, authorization, and the concurrency-sensitive parts of
  the ticket/asset workflows have been specifically reviewed and tested
  for correctness under race conditions and adversarial input.
- What's missing is explicitly listed above (Knowledge Base, analytics,
  audit logging, containerization, CI/CD, deployment) and tracked in
  `TASKS.md` rather than left implicit.
- It has not been deployed anywhere, has no CI pipeline yet, and should
  not be described as production-ready — that claim isn't true yet, and
  reaching it is exactly what Phases 13–16 exist to do.

## License

This project is intended as a portfolio project.
