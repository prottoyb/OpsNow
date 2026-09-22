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

**Phases 0–16 are complete.** Phase 17 (Final Review & Portfolio
Preparation) is the only phase left.

Four different things get called "done" in a project like this, so they
are separated deliberately:

| | State |
| --- | --- |
| **Built, tested and reviewed** | Phases 0–13. Every feature area, plus a cross-cutting hardening pass. |
| **Locally deployment-ready** | Phases 14–16. Production container images, a full-stack Compose run, a CI pipeline and a documented deployment posture — all written, none of it running anywhere. |
| **Actually deployed** | **Nothing.** There is no hosting account, no managed database, no registry, no domain and no credential. The application has never run outside a developer's machine. |
| **Remaining** | Phase 17, plus the external steps in `docs/deployment.md` that need an account and a card. |

Two things in that table are unverified-by-execution and are flagged
wherever they appear rather than only here:

- **The container images have never been built.** Docker is not installed
  on the machine they were authored on. They were statically checked, the
  Compose file parses, and the compiled backend was booted with
  `NODE_ENV=production` and exercised — but the first `docker compose up`
  is an untried step. `docs/docker.md` says so at the top and lists what
  to suspect if it fails.
- **The CI pipeline has never run.** Nothing has been pushed, so no run
  exists. Every command it executes passes locally.

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
- Knowledge base: authoring, categorisation, Postgres full-text search,
  article feedback and ticket↔article links, with a matching UI.
- Dashboard and analytics: ticket, SLA, category and agent metrics,
  computed on demand with a raw-SQL visibility twin, and a filterable
  management dashboard.
- Audit logging: an append-only trail across authentication, ticket
  changes, assignment changes and permission denials, with structural
  secret redaction and an Administrator-only reader.
- AI ticket assistant: an optional, off-by-default provider side car
  offering advisory triage, response drafts and resolution summaries,
  which can never change a ticket by itself.
- Role-aware employee/staff interfaces throughout the above features.
- Unit, component and end-to-end (Playwright) test coverage for every
  completed area.
- Swagger/OpenAPI documentation for every implemented backend endpoint —
  published outside production, and off by default in it.
- Cross-cutting hardening (Phase 13): control-character validation on
  every free-text field, brute-force throttling on the credential
  endpoints, safe `req.ip` derivation behind a proxy, a backend linter, a
  frontend render error boundary, and browser coverage for authentication
  and RBAC.
- Containerisation (Phase 14), a GitHub Actions pipeline (Phase 15), and
  a documented production posture with environment validation that
  refuses to boot on a bad configuration (Phase 16).

## What Remains to Be Built

**Phase 17 — Final Review & Portfolio Preparation** is the only phase
left. Its review pass, architecture/database diagrams, API documentation,
decisions summary, demo data and interview/demo material are complete —
see the Documentation Map above and `TASKS.md`'s Phase 17 section for the
line-by-line checklist. What's still open is only what genuinely can't be
closed from inside this repository: building the container images (no
Docker on the authoring machine) and everything in `docs/deployment.md`
that needs a hosting account, a managed database, a registry, a domain or
a credential — none of which exist.

Everything else that remains needs something outside this repository. See
`docs/deployment.md` for the full list; in short, a hosting platform, a
managed PostgreSQL instance, a container registry, a domain with TLS, and
somewhere to keep secrets. None of those exist, so:

- No image has been pushed to a registry, and there is no tagging scheme.
- The CI pipeline has no deployment job, deliberately. A workflow written
  against a target that does not exist — or one carrying empty secret
  references waiting to be filled — is worse than an honest gap.
- The first administrator account cannot currently be created through the
  API. `POST /auth/register` always creates an `Employee` and the role is
  not settable, while the seed script wipes the database and must never
  run against a deployment. A first real deployment therefore needs a
  one-off SQL promotion; a small `create-admin` CLI is the right fix and
  is recorded as a gap.

Smaller tracked deferrals are listed per phase in `TASKS.md` and are not
repeated here. The two that were called out in earlier versions of this
README have moved on: auth rate limiting **is now implemented**
(ADR-026), and the staff-visible user directory endpoint is **still
open**.

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
- `@nestjs/throttler` for brute-force protection on the credential
  endpoints (ADR-026)
- Swagger/OpenAPI for API documentation (`/api/docs`, off by default in
  production)

**Database**
- PostgreSQL, UUID primary keys, Prisma migrations

**Testing**
- Jest + Supertest (backend unit + e2e, against a real local Postgres)
- Vitest + Testing Library (frontend unit/component)
- Playwright (end-to-end, against the real running stack)

**Infrastructure**
- Multi-stage Docker images for both halves, plus a Compose stack
  (Postgres, a one-shot migration job, the API, and nginx serving the SPA
  and proxying `/api`). Written and statically checked, but never built —
  Docker is not installed on the authoring machine.
- GitHub Actions for CI: typecheck, lint, unit, e2e, Playwright,
  dependency audit and image builds. Written, but never run — nothing has
  been pushed.
- No hosting, registry, domain or deployed instance of any kind.

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

- **Backend**: 864 Jest unit tests across 44 suites for
  services/guards/pure logic, plus a Supertest e2e suite (12 spec files,
  350 tests) run against a real local PostgreSQL database — not mocks —
  covering the full role grid for every endpoint.
- **Frontend**: 481 Vitest + Testing Library component/unit tests across
  39 files, including a repository-wide guard suite that fails the build
  on unsafe DOM patterns or storage use.
- **End-to-end**: 11 Playwright specs (`frontend/e2e/`) drive the real
  running frontend against the real running backend and database for the
  ticket, SLA, asset, authentication and RBAC workflows, including a
  cross-role journey (an employee and a staff member in separate browser
  contexts, since the refresh cookie is httpOnly).

These counts are current as of the Phase 17 final verification pass —
every suite above (backend unit, backend e2e, frontend unit, Playwright)
was run in full immediately before this README section was last updated,
all green, against real local Postgres.
- **Static gates**: both packages run `tsc --noEmit` and ESLint. The
  backend's lint is type-aware and treats the promise rules
  (`no-floating-promises`, `await-thenable`, `no-misused-promises`) as
  errors, because nearly every service method is async and talks to
  Prisma, where an unawaited write is a silent data bug rather than a
  type error. Both run at zero tolerance for warnings.
- **Drift guards**: the frontend cannot import backend code, so where it
  mirrors a backend constant — the audit action list, the AI failure
  reasons, the field length limits — a test parses the backend source and
  fails if the two diverge.
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
- Brute-force throttling on `/auth/login`, `/auth/register` and
  `/auth/refresh` — 10 attempts per minute per client by default, each
  route on its own counter, with no value that switches it off (ADR-026).
  It is deliberately not global: a blanket limit on an authenticated ITSM
  API would rate-limit an agent's ordinary work to protect endpoints the
  limit was never about.
- `req.ip` is derived through an explicit proxy **hop count**
  (`TRUST_PROXY_HOPS`), never Express' boolean `true`. That value decides
  what the throttle counts and what every audit row records, and `true`
  would let any client forge it.
- Every free-text field rejects C0 control characters. A NUL byte used to
  reach Postgres, which cannot store it, and surfaced as an unhandled 500
  rather than a 400.
- Swagger (`/api/docs`) is **off by default in production** and on by
  default elsewhere, overridable both ways. It describes every route,
  role gate and response shape and has no authentication in front of it,
  so publishing it is an opt-in that also logs a warning (ADR-027).
- **Known, tracked gaps**: the auth throttle counter is per process, so
  more than one API replica multiplies the effective limit; a blocked
  (429) attempt writes no audit row, so the log an operator would check
  for an attack does not show the block itself; and logs are plain text
  with no request correlation id.

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
├── docs/
│   ├── docker.md            Running the containerised stack
│   ├── deployment.md        Production posture and the remaining external steps
│   ├── decisions-summary.md Fast-reference trade-off summary of DECISIONS.md
│   ├── architecture/        System architecture and database ERD (Mermaid)
│   ├── api/                 Human-readable API conventions (companion to Swagger)
│   ├── portfolio/           Interview prep and demo walkthrough
│   └── releases/            Release notes per tag
├── database/               Reserved for standalone DB assets (currently empty)
├── .github/workflows/      CI pipeline (Phase 15)
├── docker-compose.yml      Full-stack local run (Phase 14)
├── .env.docker.example     Environment template for the Compose stack
├── scripts/
│   └── setup-ai-team.ps1   Links .claude/ to the shared AI team framework (see below)
├── .claude/                Structured AI-development workflow (see below)
├── TASKS.md                Phase-by-phase task checklist (source of truth for status)
├── progress.md             Full development log, phase by phase
├── DECISIONS.md            Architecture Decision Records (ADR-001…ADR-027)
└── CLAUDE.md               Project-specific development instructions
```

Both `backend/` and `frontend/` additionally carry a multi-stage
`Dockerfile` and a `.dockerignore`; the frontend also carries the
`nginx.conf` that makes the API same-origin in a container.

## Local Development Setup

Prerequisites: Node.js 24 (what the project is developed, containerised
and CI-tested on; 22 also works), a local PostgreSQL instance, and an
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

One caveat since Phase 13: the Playwright suite signs in enough times to
trip the auth throttle, so start the backend with a raised limit for it —
`AUTH_THROTTLE_LIMIT=1000 npm run start:dev`. The suite's global setup
detects the 429 and prints this instruction rather than failing as if the
credentials were wrong. Don't lower the shipped default to make it pass;
10 per minute is the production setting.

## Running the Whole Stack in Docker

```
cp .env.docker.example .env
# set POSTGRES_PASSWORD and JWT_ACCESS_SECRET — both are required and
# have no default, so Compose refuses to start without them
docker compose up --build
# then open http://localhost:8080
```

The stack is self-contained and **cannot touch your local development
database**: its own Postgres container, its own volume, database `opsnow`
rather than `opsnow_dev`, host port 5433 rather than 5432, and no
automatic seeding (the seed script wipes every table, so running it stays
a deliberate manual act).

The API is deliberately not published to the host. The browser reaches it
only through the frontend's nginx proxy at `/api`, which is the only
same-origin path — and same-origin is a hard requirement, not a
preference, because the refresh cookie is `SameSite=Strict` and
path-scoped and the backend rejects a cross-origin refresh outright.

> **Never built.** Docker is not installed on the machine these images
> were authored on, so `docker compose up` has not been run even once.
> The Compose file parses, the images were statically checked, and the
> compiled backend was booted with `NODE_ENV=production` and exercised —
> but expect to fix something on the first build. `docs/docker.md`
> explains the setup in full and lists what to suspect if it fails.

## Continuous Integration

`.github/workflows/ci.yml` runs five jobs on every push and pull request:

| Job | What it does |
| --- | --- |
| `frontend` | typecheck, eslint, vitest, production build |
| `backend` | prisma validate / generate / `migrate deploy` / `migrate status`, seed, typecheck, eslint, unit, e2e — against a Postgres service container |
| `browser-e2e` | builds and starts the compiled API, waits on the real health endpoint, runs Playwright, uploads traces on failure |
| `dependency-audit` | `npm audit --omit=dev --audit-level=high` on both packages |
| `docker` | builds all three images, renders `docker compose config`, and syntax-checks `nginx.conf` inside the nginx version the image uses |

That last job matters more than usual: CI is the first place the
container images will actually be built.

There is no deployment job, deliberately — see below.

> **Never run.** Nothing has been pushed, so no workflow run exists.
> Every command it executes passes locally.

## Deployment

**OpsNow is not deployed anywhere.** There is no hosting account, no
managed database, no container registry, no domain and no credential.

What exists is everything that can be built without a target: production
images, a Compose stack, a CI pipeline, environment validation that
refuses to boot on a bad configuration, and `docs/deployment.md` — which
covers the origin model and why it is not negotiable, every environment
variable with its production value, the migration rules, which health
probe belongs where, a pre-launch security checklist, and the ten
external steps that each need an account or a card.

The short version of the posture (ADR-027):

- **Same-origin only.** The SPA and `/api` must share one origin. A
  split-origin deployment is a design change, not a configuration, and
  CORS cannot fix it — CORS does not make a `SameSite=Strict` cookie
  travel. Production CORS is therefore disabled, and that *is* the
  configuration.
- **HTTPS is required**, not recommended. The refresh cookie is `Secure`
  in production, so without TLS a browser never sends it back and every
  session dies on reload.
- **`TRUST_PROXY_HOPS` must match reality.** Too low and one attacker
  throttles every user at once; too high and a forged `X-Forwarded-For`
  buys a fresh throttle bucket and a chosen address in the audit log.
- **Migrations are `prisma migrate deploy`, run as a separate step before
  the new version starts.** Never `migrate dev`, `db push`, `migrate
  reset` or `db seed` against a deployment.
- **`/api/v1/health` is readiness** (pings the database);
  **`/api/v1/health/live` is liveness** (checks nothing). Pointing a
  liveness probe at the database turns a brief Postgres blip into a
  rolling restart of every instance.

## Current Roadmap

See `TASKS.md` for the authoritative, task-level breakdown.

Phases 0–16 are complete. Phase 17's checklist is complete for everything
that can be finished from inside this repository: the review pass, the
architecture and database diagrams, API documentation, the decisions
summary, demo data, and interview/demo material. See `TASKS.md` for
exactly which Phase 17 line items remain open and why.

Two items are not Phase 17 work in the ordinary sense — they don't need
more engineering, they need resources this repository can't supply on its
own — and are tracked as such in `TASKS.md`:

1. Build and start the container stack on a machine that has Docker, and
   fix whatever the first run surfaces.
2. Work through the external steps in `docs/deployment.md` — they all
   need an account, a credential or a card.

## Documentation Map

| Document | What it's for |
| --- | --- |
| `docs/architecture/system-architecture.md` | Component/request-pipeline diagram, refresh-token flow, the AI provider boundary |
| `docs/architecture/database-erd.md` | Entity-relationship diagrams (core ITSM + supporting tables) matching the actual Prisma schema |
| `docs/api/README.md` | API conventions — auth model, RBAC, error envelope, 404-vs-403, concurrency/409, pagination — companion to Swagger, not a duplicate of it |
| `docs/decisions-summary.md` | One-paragraph-per-decision fast reference into the full `DECISIONS.md` ADRs |
| `docs/portfolio/interview-prep.md` | 60-second/2-3-minute explanations, a walked-through hard problem, honest trade-offs |
| `docs/portfolio/demo-walkthrough.md` | A live-demo/recording script, with the seeded demo accounts |
| `docs/docker.md` | Running the containerised stack |
| `docs/deployment.md` | Production posture and the external steps a real deployment would need |
| `docs/releases/v0.1.0.md` | Release notes for the current tag |
| `DECISIONS.md` | The full Architecture Decision Records, ADR-001 through ADR-027 |
| `TASKS.md` / `progress.md` | Phase-by-phase task checklist and full development log |

## Engineering Decisions / Design Principles

Every non-trivial technical decision is recorded as a numbered Architecture
Decision Record in `DECISIONS.md` (currently ADR-001 through ADR-027),
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
- **Don't drop known gaps silently.** Deferred work is tracked per
  phase in `TASKS.md`, not abandoned. The same applies to what has not
  been *verified*: the container images and the CI pipeline are written
  but have never been executed, and that is stated wherever they are
  described rather than left for someone to find out.

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

`.claude/framework`, `.claude/agents`, `.claude/rules` and `.claude/skills`
are not files committed to this repository — they are local Windows
directory junctions into a separate, shared `AI-Software-Team` framework
repository that OpsNow consumes but doesn't fork or duplicate. This keeps
the framework's own history, versioning and reuse across other projects
intact instead of forking it per-project. `.gitignore` excludes `.claude/`,
and none of these junctions (or `.claude/` itself) are tracked in Git.

`CLAUDE.md` pulls in the framework's own constitution with the stable,
relative `@.claude/framework/CLAUDE.md` import rather than an absolute
path, so the tracked project config never hard-codes any one developer's
local checkout location.

Run `.\scripts\setup-ai-team.ps1` to create or repair all four junctions —
including creating `.claude/` itself on a fresh checkout, since it won't
exist until this script runs. It defaults to this developer's local
framework checkout path but accepts `-TeamPath` for a different location,
validates the source before touching anything, never overwrites a real
directory, and is safe to run repeatedly. This is a development-time
dependency only: OpsNow the application has no runtime dependency on
Claude Code or the framework repository, and none of this affects
`backend/` or `frontend/`.

In practice, every completed phase in this repository went through this
same cycle: an implementation pass, followed by independent QA/security
and senior review against the real running code, with findings fixed (or
explicitly deferred and tracked) before the phase was marked complete.
The engineering substance of the result — the architecture, the access
control, the concurrency handling, the tests — is the point; the workflow
is what kept it consistent across ~20 phases of work.

## Project Maturity / Portfolio Status

OpsNow is a **complete, working ITSM system that has never been
deployed**. As of this checkpoint (Phases 0–16 complete, Phase 17 next):

- Every feature area — tickets, SLA, assets, knowledge base, analytics,
  audit logging and the optional AI assistant — is complete end to end
  (backend API, frontend UI, tests) and has been exercised against a real
  database and a real running server, not only unit-tested in isolation.
- Authentication, authorization, and the concurrency-sensitive parts of
  the ticket and asset workflows have been specifically reviewed and
  tested for correctness under race conditions and adversarial input.
- It is **locally deployment-ready**: production container images, a
  full-stack Compose run, a CI pipeline covering every gate, environment
  validation that refuses to boot on a bad configuration, and a written
  production posture (ADR-027, `docs/deployment.md`).
- It is **not deployed**, and nothing here should be read as claiming
  otherwise. No hosting account, managed database, registry, domain or
  credential exists.
- Two pieces of that deployment-readiness are **written but never
  executed**: the container images have never been built (Docker is not
  installed on the authoring machine) and the CI pipeline has never run
  (nothing has been pushed). Both are labelled as such in
  `docs/docker.md`, `TASKS.md` and `progress.md` rather than being left
  to be discovered.
- "Production-ready" would be an overstatement while the images are
  untried and there is no error reporting, log aggregation or backup
  strategy. Closing that is the work described in `docs/deployment.md`,
  not a code change.

## License

This project is intended as a portfolio project.
