\# OpsNow Development Progress



\## Current Status



Project status: In Progress



Current phase: Phase 8 — Asset Management (not started)



Current task: none — Phase 7b is complete



Last completed task: Phase 7b — SLA Management Frontend UI (per-ticket

SLA panel on the ticket detail page, a per-row SLA indicator in the ticket

list, and a staff-only SLA dashboard over the existing policy/metrics

endpoints — implemented, tested and verified; no backend file changed and

no dependency added)



Next task: Begin Phase 8 — Asset Management



\---



\## Development Log



\### 2026-09-14 — Project Initialization



Completed:



\- Created `D:\\Projects\\OpsNow`

\- Initialized Git repository

\- Created initial project directories

\- Created `CLAUDE.md`

\- Created `TASKS.md`



Git status:



\- Repository initialized

\- No commits created yet



Next:



\- Complete project-control files

\- Create initial Git checkpoint

\- Begin architecture planning



\---



\### 2026-09-14 — Phase 1 Architecture Approved



Completed:



\- Produced a full Phase 1 architecture proposal covering application,

frontend, backend, database, authentication, RBAC, API conventions,

error handling, testing, Docker, CI/CD and folder structure.

\- Project owner reviewed and approved the proposal with 15 explicit

architecture decisions (ORM, test runners, auth/token strategy,

password hashing, styling, primary keys, roles, API versioning,

migration strategy, repository simplicity).

\- Recorded the approved decisions as ADR-005, ADR-006, ADR-007,

ADR-008 (updated) and new ADR-014 through ADR-017 in `DECISIONS.md`.

\- Checked off all Phase 0 and Phase 1 tasks in `TASKS.md`.



Key decisions:



\- ORM/migrations: Prisma

\- Backend testing: Jest + Supertest; Frontend testing: Vitest;

E2E testing: Playwright

\- Auth: short-lived JWT access tokens, httpOnly/Secure refresh cookies,

Argon2id password hashing

\- RBAC: fixed roles (Employee, Support Agent, Team Lead, Administrator),

enforced on the backend only

\- API: REST, versioned under `/api/v1`

\- Database: PostgreSQL, UUID primary keys, Prisma migrations as the

source of truth for schema

\- Frontend styling: Tailwind CSS

\- Repository: single repo, no monorepo tooling, no microservices, no

message queues

\- AI ticket assistance remains optional and separate from core

architecture (ADR-011, unchanged)



Git status:



\- No commit created for this update (pending explicit instruction)



Next:



\- Begin Phase 2 — Database: configure PostgreSQL, configure Prisma,

design initial schema (users/roles, tickets, comments, history, SLA,

assets, knowledge base, notifications, audit log)



\---



\### 2026-09-14 — Phase 2 Database Implemented



Completed:



\- Set up the Prisma foundation under `backend/` (package.json, tsconfig.json,

`.env.example`) without scaffolding NestJS — Phase 3 remains untouched.

\- Installed PostgreSQL 17 locally (Windows service) since no database or

Docker was available in this environment; created the `opsnow_dev` database

and a dedicated `opsnow` role.

\- Wrote `backend/prisma/schema.prisma` covering all 18 approved tables and

7 enums, matching the approved Phase 2 model exactly (UUID primary keys,

approved delete behaviors, approved indexes).

\- Generated the initial migration in draft mode, hand-reviewed it, and added

the PostgreSQL-specific SQL Prisma cannot express declaratively: 5 CHECK

constraints, 7 partial/filtered unique indexes, and a STORED generated

`tsvector` column with a GIN index for knowledge-base full-text search.

\- Applied the migration to `opsnow_dev` and generated the Prisma Client.

\- Wrote `backend/prisma/seed.ts` with realistic ITSM seed data: 7 users

(one per role plus extra employees/agents), a hierarchical ticket-category

tree, 6 asset types, 5 assets with assignment history, 4 SLA policies (one

active per priority), 3 knowledge-base articles, and 5 tickets spanning

New/InProgress/OnHold/Resolved/Open (including one reopened ticket showing

the "no new SLA cycle on reopen" behavior).

\- Verified the database directly: table/row counts, all 7 partial unique

indexes and all 5 CHECK constraints present, full-text search returning

correct results, and a CHECK constraint plus a partial unique index both

confirmed to actually reject bad inserts (not just declared). Verified

relationships resolve correctly through Prisma Client (ticket → requester

/assignee/category/history/sla/linked article; asset → current holder/

assignment history; category → parent/children).

\- Updated ADR-005 to explicitly document Argon2id for password hashing and

SHA-256 for refresh-token hashing.



Verification results:



\- `prisma validate`: schema valid.

\- `prisma migrate status`: database schema up to date, no drift.

\- `tsc --noEmit`: seed script type-checks cleanly.

\- Manual SQL checks: full-text search query returned the expected article;

an out-of-range `sla_policies` insert was rejected by its CHECK constraint;

a second open `asset_assignments` row for the same asset was rejected by

its partial unique index.

\- `npm audit`: 3 high-severity findings, all in a transitive dev-tool

dependency (`deepmerge-ts`, via `@prisma/config`) used only by the Prisma

CLI's own config loader — not part of the application runtime, no fix

currently available without a breaking change.



Git status:



\- Not yet committed at the time this entry was written; see the following

commit for the recorded Phase 2 changes.



Next:



\- Begin Phase 3 — Backend Foundation: initialize the NestJS application,

configure environment variables, logging, global validation, error

handling, API documentation, and a health-check endpoint.



\---



\### 2026-09-14 — Phase 3 Backend Foundation Implemented



Completed:



\- Initialized the NestJS application under `backend/src` alongside the existing

Phase 2 Prisma layer: `main.ts` bootstrap, `AppModule`, a shared `configureApp()`

helper (prefix/versioning/validation/error-filter wiring, used by both `main.ts`

and the e2e test bootstrap so they cannot drift apart).

\- Configured environment variables via `@nestjs/config` with a Joi-based

`validate` function (`src/config/env.validation.ts`) checking `NODE_ENV`, `PORT`,

and `DATABASE_URL`; app fails fast on invalid/missing config. Added `NODE_ENV`

and `PORT` to `.env` / `.env.example` alongside the existing `DATABASE_URL`.

\- Wired the existing Prisma layer into Nest via a `@Global()` `PrismaModule` /

`PrismaService` (connect/disconnect on module lifecycle hooks; `enableShutdownHooks()`

added in `main.ts` so `$disconnect()` actually runs on SIGTERM).

\- Added a database-backed health check at `GET /api/v1/health` using

`@nestjs/terminus`'s official `HealthCheckService` + built-in `PrismaHealthIndicator`

(reused rather than writing a custom indicator).

\- Added a global `AllExceptionsFilter` producing a consistent `{statusCode,

timestamp, path, message}` error body; preserves any extra diagnostic fields an

`HttpException` body carries (e.g. Terminus's `info`/`error`/`details` on a

health-check failure) while never returning a stack trace — stack traces are

logged server-side only, and only for 5xx/non-HTTP exceptions.

\- Added global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform),

`/api/v1` URI versioning, and Swagger/OpenAPI docs at `/api/docs`.

\- Established the backend testing foundation: Jest unit tests (health controller,

Prisma service lifecycle, exception filter) and a Supertest e2e suite

(`test/app.e2e-spec.ts`) exercising `/api/v1/health` against the real local

Postgres dev database and a structured-404 case. 5 unit tests + 2 e2e tests, all

passing.

\- Updated `backend/package.json`: added the NestJS v11.x package line (not the

newest v12.x — see Key decisions), `class-validator`, `class-transformer`,

`joi`, `reflect-metadata`, `rxjs` as runtime deps, and the matching dev/test

tooling (`@nestjs/cli`, `@nestjs/testing`, `jest`, `ts-jest`, `supertest`,

`@types/express`, `@types/jest`, `@types/supertest`).

\- Closed two high-severity transitive `npm audit` findings via an `overrides`

block: `multer` pinned to `2.3.0` (pulled in vulnerable at `2.2.0` by

`@nestjs/platform-express`) and `deepmerge-ts` pinned to `8.0.2` (pulled in

vulnerable by Prisma's own `@prisma/config` — previously an accepted-risk item

in the Phase 2 log; now actually fixed instead of just accepted).

`npm audit` reports 0 vulnerabilities.



Review findings (QA/Security and Senior Review, run independently against the

actual code and test suite):



\- 2 HIGH findings, both fixed and re-verified against a real running server

with the local Postgres instance stopped/restarted: (1) `PrismaService.onModuleInit`

previously let a startup connection failure crash the whole app instead of

starting and letting `/health` report `503` — now catches and logs instead of

throwing. (2) `AllExceptionsFilter` previously collapsed every error to a bare

`message`, discarding Terminus's `info`/`error`/`details` on a health-check

failure — now preserves them. Both fixes have regression tests

(`prisma.service.spec.ts`, `all-exceptions.filter.spec.ts`).

\- 2 MEDIUM findings from Senior Review, fixed: missing `app.enableShutdownHooks()`;

e2e test bootstrap duplicated `main.ts`'s config instead of sharing it (now

both use `configureApp()`).

\- 1 MEDIUM finding, deferred (documented, not blocking — no HIGH/CRITICAL

remains): the `allowScripts` block in `backend/package.json` (a Phase

2-originated convention for gating npm install/postinstall scripts) has no

effect under plain npm — it requires a tool like `@lavamoat/allow-scripts` or

an `.npmrc` with `ignore-scripts=true` plus explicit rebuild steps to actually

enforce anything. Confirmed `@scarf/scarf`'s telemetry postinstall script ran

despite being marked `false`. Follow-up: decide and wire up a real enforcement

mechanism (tracked, not silently dropped).

\- 2 LOW findings, fixed: stray `tsconfig.build.tsbuildinfo` wasn't gitignored

(also relocated it inside `dist/` via `tsBuildInfoFile`, since it living at the

project root was independently found to cause a stale-incremental-build bug —

see Key decisions); unused `source-map-support` dev dependency removed.

\- 1 LOW finding, informational only per reviewer instruction (not blocking):

Swagger UI is mounted unauthenticated at `/api/docs` in every environment —

worth revisiting before a real production deploy.



Key decisions:



\- Pinned the whole `@nestjs/*` family to the v11.x line (`@nestjs/config`

further back at `^4.0.4`) rather than the newest v12.x. `@nestjs/core`,

`@nestjs/platform-express`, `@nestjs/terminus`, and `@nestjs/swagger` at v12 are

now ESM-only (`"type":"module"`), which is incompatible with this project's

CommonJS `ts-jest`/Jest setup and with Prisma's existing `ts-node`-based seed

tooling; migrating the whole toolchain to ESM was judged unnecessary complexity

at this stage (ADR-017) versus pinning a still-current, actively maintained,

fully CommonJS major version. `@nestjs/config@12` also dropped native Joi

`validationSchema` support in favor of the "Standard Schema" spec (Zod/Valibot/

etc.); `env.validation.ts` uses `ConfigModule`'s `validate` custom-function hook

instead, which is stable across both API generations.

\- Reused `@nestjs/terminus`'s official built-in `PrismaHealthIndicator` for the

health check instead of writing a custom indicator (Terminus ships one; no

reason to duplicate it).

\- Discovered and fixed a TypeScript incremental-build trap: `tsc`'s default

`.tsbuildinfo` cache location (project root) sits outside `dist/`, so deleting

only `dist/` left `tsc` believing stale output was still current and it silently

emitted nothing on the next build. Fixed by setting `tsBuildInfoFile` inside

`dist/` so `nest build`'s `deleteOutDir` clears both together.

\- No ADR was written for this phase: NestJS, `/api/v1` versioning, and

Jest/Supertest were already decided in ADR-003/007/008/014; the version-pinning

and tooling choices above are implementation-level and reversible, not new

architectural boundaries.



Verification results:



\- `npx tsc --noEmit`: clean. `npm run build`: clean, `dist/main.js` emits at the

top level as expected.

\- `npm test`: 3 suites, 5 tests, all passing.

\- `npm run test:e2e`: 1 suite, 2 tests, all passing against the real local

`opsnow_dev` Postgres database.

\- `npm audit`: 0 vulnerabilities.

\- `npx prisma migrate status`: database schema up to date, no drift (Phase 2

layer untouched).

\- Manually verified against a real running instance (`node dist/main.js`):

normal boot + `/api/v1/health` returns `200` with the DB reachable; app boots

successfully and `/api/v1/health` returns `503` with full diagnostic detail

when the DB is unreachable (verified by pointing `DATABASE_URL` at a closed

port); recovers to `200` once the DB is reachable again; `/api/docs` (Swagger)

returns `200`.



Git status:



\- Not yet committed at the time this entry was written; see the following

commit for the recorded Phase 3 changes.



Next:



\- Begin Phase 4 — Authentication: user model, registration/login flows,

password hashing (Argon2id per ADR-005), access/refresh tokens, logout, expired

token handling, route protection, and authentication tests.



\---



\### 2026-09-14 — Phase 4 Authentication Implemented



Completed:



\- Planned Phase 4 in Claude Code's plan mode: an independent architect-role

review validated the design against ADR-005/006 and the actual Phase 2 schema

before any code was written, and required several corrections that were

folded into the plan (soft-delete/email-casing handling, atomic refresh

rotation, timing-safe login, a new ADR for the route-protection posture, and

a tracked rate-limiting follow-up) — see the approved plan for the full

design rationale.

\- No new Prisma migration was needed: Phase 2's schema already had

`User.passwordHash`/`role`/`isActive`/`deletedAt` and a fully rotation-capable

`RefreshToken` model (`tokenHash`, `expiresAt`, `revokedAt`, `replacedById`).

\- Added `backend/src/users/` (`UsersService`/`UsersModule`) — email

normalized to lowercase on every read/write, soft-deleted users always

filtered out.

\- Added `backend/src/auth/` — `AuthController`/`AuthService`, a Passport

`JwtStrategy`, a globally-registered `JwtAuthGuard` (default-deny; every

route requires a valid access token unless marked `@Public()` — recorded as

**ADR-018**), `@Public()`/`@CurrentUser()` decorators, `RegisterDto`/`LoginDto`.

\- Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,

`POST /auth/logout`, `GET /auth/me`. Access tokens are short-lived JWTs

(`@nestjs/jwt`); refresh tokens are opaque random values, SHA-256 hashed

before storage, delivered only via an httpOnly/SameSite=Strict/path-scoped

cookie (ADR-005). Refresh rotation is atomic (DB transaction, conditional

update gated on the token still being unrevoked) so concurrent requests for

the same token can't both succeed. Reuse of an already-rotated token is

treated as suspected theft and revokes the user's entire active-token family.

Login runs a real Argon2 verify against a dummy hash on the "unknown email"

path so response timing doesn't leak whether an account exists.

\- `backend/src/health/health.controller.ts` marked `@Public()` so it kept

working once the global guard was added.

\- New dependencies: `@nestjs/jwt`, `@nestjs/passport`, `passport`,

`passport-jwt`, `cookie-parser` (+ type packages) — all pinned to their

v11.x-compatible lines, continuing Phase 3's established pattern of avoiding

`@nestjs/*` v12 (ESM-only, incompatible with this project's CommonJS

Jest/ts-node setup).

\- Tests: 30 unit tests (`UsersService`, `AuthService` incl. registration

race handling, timing-safe login, atomic rotation, reuse/theft detection,

deactivated/deleted-user rejection; `JwtStrategy`; `JwtAuthGuard`'s

`@Public()` bypass) + 13 e2e tests (`backend/test/auth.e2e-spec.ts`, against

the real local Postgres dev database) covering the full

register→login→me→refresh→logout flow, duplicate registration, wrong

password, no/malformed token, refresh-token reuse and family revocation, a

deactivated user's refresh being rejected, and a cross-origin `Origin` header

being rejected on `/refresh`. All 43 tests passing; the 7 Phase-2-seeded

`@opsnow.local` accounts were confirmed untouched throughout (test-created

users are cleaned up in `afterAll`).



Review findings (independent QA/Security and Senior Review, run against the

actual code and running server, same process as Phase 3):



\- No CRITICAL or HIGH findings from either reviewer.

\- QA/Security raised 2 MEDIUM findings: (1) missing test coverage for

`refresh()` when the token's user has since been deactivated or deleted —

fixed, with both a unit test and an e2e test added; (2) rate limiting on

`/auth/login`/`/auth/register` is still absent — already an explicitly

tracked, documented deferral (see below), confirmed by QA/Security to

satisfy the deferral rule since no CRITICAL/HIGH exists on this change, but

flagged that it should not be allowed to slip past Phase 16.

\- Senior Review found no correctness bugs, confirmed the refresh-rotation

transaction is genuinely safe (the FK-driven "create child, then

conditionally update parent" ordering was deliberately verified, not just

assumed), and raised 1 LOW finding (the refresh-token TTL default was

hardcoded independently in three places) — fixed, by extracting

`DEFAULT_JWT_ACCESS_EXPIRES_IN`/`DEFAULT_REFRESH_TOKEN_TTL_SECONDS` as shared

constants in `env.validation.ts`. Two OPTIONAL notes (no CSRF origin-check on

login/register — low-impact "login CSRF", mitigated by SameSite=Strict; a

minor message-wording inconsistency) were left as-is, not blocking.



Known, deliberately deferred (not silently dropped — tracked in `TASKS.md`'s

Phase 4 section):



\- **Rate limiting on `/auth/login` and `/auth/register`.** No brute-force or

credential-stuffing protection exists yet on these endpoints. Both

independent reviewers confirmed this is an acceptable, documented MEDIUM

deferral for this phase (no CRITICAL/HIGH exists), but it must be closed

before Phase 16 (deployment) or any public-facing demo.



Verification results:



\- `npx tsc --noEmit`: clean. `npm run build`: clean.

\- `npm test`: 7 suites, 30 tests, all passing.

\- `npm run test:e2e`: 2 suites, 13 tests, all passing against the real local

`opsnow_dev` Postgres database.

\- `npm audit`: 0 vulnerabilities.

\- Manually verified against a real running instance (`node dist/main.js`):

logged in as a real Phase-2-seeded user (`employee1@opsnow.local`), called

`/auth/me` with the resulting access token, rotated via `/auth/refresh`,

confirmed both the pre- and post-rotation refresh cookies were rejected

after a reuse attempt (whole-family revocation), confirmed a cross-origin

`Origin` header was rejected (403) on `/auth/refresh`, logged out (204) and

confirmed the refresh cookie no longer worked (401), registered and then

duplicate-registered a fresh user (201 then 409), and confirmed both

`/api/v1/health` and `/api/docs` (Swagger) remained reachable without a

token. All manually-created accounts were cleaned up afterward; seeded user

count confirmed back at 7.



Git status:



\- Not yet committed at the time this entry was written; see the following

commit for the recorded Phase 4 changes.



Next:



\- Begin Phase 5 — Authorization \& RBAC: roles, permissions, backend

authorization guards, and per-role permission sets (Employee, Support Agent,

Team Lead, Administrator) built on top of the `role` claim Phase 4 already

attaches to `request.user`.



\---



\### 2026-09-14 — Phase 5 Authorization \& RBAC Implemented



Completed:



\- Added a `@Roles(...roles)` decorator and a `RolesGuard`, registered as a

SECOND global `APP_GUARD` in `AuthModule` (after `JwtAuthGuard`, same

providers array) — an architect-role review corrected an earlier per-route

`@UseGuards()` draft to this global approach specifically because a

per-route guard can be forgotten and fails open, the same risk ADR-018

already eliminated for authentication.

\- No permissions table and no new Prisma migration — per ADR-006's

explicit "fixed enum, not a dynamic permissions table" decision, already

fully supported by the Phase 2 `Role` enum.

\- Shipped one concrete, non-speculative demonstration endpoint:

`GET /api/v1/users` (Administrator-only, paginated, safe fields only),

extending the existing `UsersService`.

\- New ADR-018 (Default-Deny Route Protection) recorded in `DECISIONS.md`.



Review findings (independent QA/Security and Senior Review):



\- No CRITICAL/HIGH findings from either reviewer. Guard-ordering

correctness was verified directly against `@nestjs/core`'s own scanner

and guards-consumer source, not just trusted.

\- Fixed: `progress.md` and `TASKS.md` had drifted out of sync with each

other (a MEDIUM finding); `RolesGuard` now explicitly `implements

CanActivate` with proper `Role[]` typing and fails closed on an empty

`@Roles()` list instead of silently allowing everyone through; a dead

`SafeUser` type re-export was removed; `UsersService.findAll`'s `orderBy`

gained an `id` tie-breaker for stable pagination.

\- Flagged for later, not fixed in Phase 5: no ESLint config or CI

pipeline exists anywhere in the project — a known, tracked, pre-existing

gap in the Merge Readiness Gate's "CI passes" item, requiring an explicit

human decision on when to address it.



Verification: `tsc --noEmit`/`npm run build` clean; 39 unit + 24 e2e tests

passing; `npm audit` 0 vulnerabilities; manual verification of all four

seeded roles' access to `GET /api/v1/users` against a real running server;

confirmed Phases 3–4 behavior unaffected.



Git status: committed as `45333d1`.



Next:



\- Begin Phase 6 — Ticket Management.



\---



\### 2026-09-15 — Phase 6a Ticket Management Backend API Implemented



Completed:



\- Planned in Claude Code's plan mode with three parallel exploration

passes (Prisma ticket schema/seed data, TASKS.md/ADR scope, Phase 3–5

code conventions) followed by an independent architect-role review before

any code was written. The review found one CRITICAL gap (soft-delete

filtering was entirely missing from the draft) and several HIGH gaps

(no concurrency control on assignment/status races, internal-note counts

leaking via pagination `total`, inconsistent 404-vs-403, free-form status

writes, unbounded text fields) — all folded into the plan before

implementation. You then made two further changes to the approved plan:

`Closed` is terminal (only `Resolved → Open` reopens, not `Closed → Open`)

and ticket-facing user summaries use a new narrow `UserSummary` (no

email), not the existing `SafeUser`.

\- No new Prisma migration — Phase 2's `Ticket`/`TicketComment`/

`TicketHistory`/`TicketCategory`/`TicketSla` schema, enums, and CHECK

constraints already fully supported this phase.

\- Extracted a shared `PaginationQueryDto` (`backend/src/common/dto/`) from

Phase 5's `ListUsersQueryDto` as its own commit first, with a regression

test (an unknown-query-param 400 case) added and confirmed passing both

before and after the refactor.

\- Added `backend/src/ticket-categories/` (read-only `GET /ticket-categories`

— any authenticated user, active categories only, needed so a client can

discover valid `categoryId` values) and `backend/src/tickets/` (`TicketsModule`/

`TicketsService`/`TicketsController`, an explicit `ALLOWED_TRANSITIONS`

status matrix in `tickets.constants.ts`, and DTOs including Swagger

response classes rather than interfaces).

\- Added `UserSummary`/`toUserSummary()` to `UsersService` alongside the

existing `SafeUser`/`toSafeUser()` — narrower (no `email`), used for every

requester/assignee/comment-author/history-actor field on ticket responses.

\- Ownership/visibility enforced via one `ticketVisibilityWhere(user)`

service-layer helper used by every ticket read — Employees see only their

own tickets, staff see all; a ticket outside scope (wrong owner or

soft-deleted) returns 404 everywhere, not just on `GET`; an in-scope

ticket where the action itself is disallowed returns 403.

\- Optimistic concurrency (the same conditional-`updateMany`-inside-

`$transaction` pattern `AuthService.refresh()` established for refresh-

token rotation) on the two endpoints that actually need it: ticket

assignment and status transitions — `409 Conflict` on a lost race, no

schema change. Every ticket mutation that also writes a `TicketHistory`

row does so atomically in one transaction.

\- Status transitions go through an explicit matrix, not a free-form enum

write; `Closed` is terminal for every role including Administrator;

reopening (`Resolved → Open` only) clears `resolvedAt`/`closedAt` and

increments `reopenedCount`, writing two history rows exactly mirroring

the Phase 2 seed's own ticket5 reopen pattern. Resolving/closing correctly

set `resolvedAt`/`closedAt` per the `tickets_closed_requires_resolved`

CHECK constraint — deliberately diverging from the seed's own ticket5,

which reached `Resolved` in its history without ever actually setting

`resolvedAt`; the CHECK constraint is the specification, the seed's gap is

not something to replicate going forward.

\- Internal notes (`CommentVisibility.Internal`) remain staff-only to

create; an Employee's comment listing excludes them from both the

returned rows AND the `total` count (filtering only the rows would have

leaked how many internal notes exist). Ticket history stays staff-only

entirely, including for the ticket's own requester.

\- Defense-in-depth: `assign()`, `updatePriority()`, and `findHistory()`

independently re-verify the caller is staff inside the service, not just

via the controller's `@Roles()` guard.

\- New \*\*ADR-019\*\* ("Ticket Access Control and State Transitions"),

full seven-section structure, covering the three linked decisions: service-

layer query-scoping over a policy engine or ownership guard, 404-over-403

for out-of-scope resources, and the explicit transition matrix with

`Closed` as terminal.

\- Tests: unit tests for `TicketCategoriesService`, the transition-matrix

constants, `UsersService`'s new `toUserSummary()`, and a comprehensive

`TicketsService` suite (ownership scoping, 404s, the full transition

matrix including every-role-blocked-from-`Closed`, reopen semantics, CAS

409s on both assignment and status races, comment visibility filtering of

both rows and count, defense-in-depth staff checks). E2E tests

(`tickets.e2e-spec.ts`, `ticket-categories.e2e-spec.ts`) against the real

local Postgres dev database, logging in as the real seeded users across

all four roles, covering the full role grid, cross-employee 404s on every

`:id` route, the terminal-`Closed` behavior, and internal-note visibility

end to end.

\- Discovered and fixed a test-infrastructure gap while re-verifying:

with three e2e spec files now sharing one live dev database, Jest's

default parallel workers let two suites race each other (`test:e2e` was

already fixed to `--runInBand` during Phase 5 — reconfirmed still correct

here now that a third and fourth suite exist).



Review findings (independent QA/Security and Senior Review, run against

the actual code and a real running server):



\- No CRITICAL or HIGH findings from either reviewer. Both independently

verified the CAS/concurrency logic by reasoning through Postgres's

READ COMMITTED semantics (not just reading the code's own comments), and

both confirmed no email/passwordHash leakage anywhere in ticket-adjacent

responses.

\- Fixed (found independently by both reviewers — high confidence): no

`ParseUUIDPipe` on any `:id` route param, so a malformed (non-UUID) ticket

id caused a raw Prisma `P2023` error to surface as an uncaught 500 instead

of a clean 400 — added `@Param('id', ParseUUIDPipe)` to all eight

`:id`-taking routes. `PATCH /tickets/:id` (subject/description/category)

had no optimistic concurrency control at all, unlike `assign()`/status

transitions in the same file — added the identical conditional-`updateMany`

CAS pattern, gated on `updatedAt`.

\- Fixed (QA/Security): the CAS `updateMany` where-clauses for `assign()`

and status transitions didn't re-assert `ticketVisibilityWhere` at write

time, only at the earlier read — added it to both, as defense in depth

for whenever a delete/reassignment feature lands later. `createComment()`

bypassed the file's own established `runTransaction`/error-mapping

pattern — wrapped it to match every other mutating method.

\- Fixed (Senior Review): `findAll`'s `where` clause spread the ownership

filter alongside the query filters rather than isolating it, so a future

filter could have silently overwritten (and disabled) the visibility

scoping — restructured as an explicit `AND` wrapper. Added a direct unit

test asserting `deletedAt: null` on the ticket-visibility lookup — the

exact clause the pre-implementation architect review had rated CRITICAL,

which had no dedicated test until this fix. Also fixed: the non-staff

reopen check used a hardcoded parallel condition instead of consulting

`ALLOWED_TRANSITIONS` as the single source of truth; a `trim()` transform

was duplicated verbatim across three DTOs (extracted to

`common/transforms/`); ADR-019's wording overstated the 404-vs-403 rule

for the three purely role-gated routes (`assignment`/`priority`/`history`,

which 403 before any ownership check runs); TASKS.md's "Implement ticket

categories" line lacked the same "here's what this actually means" note

the entity/repository line already had.

\- Deferred, documented, not blocking (no CRITICAL/HIGH exists on this

change, per `engineering.md`'s deferral rule): `UpdateTicketDto.categoryId`

has no way to explicitly clear a ticket's category once set (`AssignTicketDto`

solved the analogous problem correctly with `@ValidateIf`); `GET /ticket-categories`

returns a bare array rather than ADR-007's `{data,total}` envelope

(defensible — it's a small fixed reference list, not a paginated

resource, not something either reviewer treated as blocking).



Verification results:



\- `npx tsc --noEmit` / `npm run build`: clean.

\- `npm test`: 99 unit tests passing (up from 94 pre-Phase-6a; the new

tests cover `TicketsService`, `TicketCategoriesService`, the transition

matrix constants, and `UsersService`'s new `toUserSummary()`).

\- `npm run test:e2e`: 67 e2e tests passing (5 suites), run five times in

total across the implementation and review-fix cycle to confirm no

flakiness, against the real local `opsnow_dev` Postgres.

\- `npm audit`: 0 vulnerabilities.

\- Manually verified the complete role grid against a real running

instance: create → assign → status transitions (including the reopen and

the terminal-`Closed` rejection) → comments (public/internal visibility)

→ history (staff-only), the malformed-UUID-id fix (400, not 500), plus a

full Phase 3–5 regression check

(health/Swagger/users-RBAC/register-login-refresh-logout). Also fired two

genuinely concurrent `PATCH` requests at the same ticket via backgrounded

curl processes — both succeeded sequentially (6ms apart) rather than

colliding, which is expected: forcing a true sub-millisecond Postgres-level

race non-deterministically from a shell isn't a reliable repro technique,

which is exactly why the CAS logic is verified deterministically in the

unit tests (mocking a `count: 0` write) instead — both independent

reviewers read the actual code against Postgres's READ COMMITTED semantics

and confirmed the logic is correct. Seeded data (7 users, 5 tickets, 3

comments, 14 history rows) confirmed unchanged after every verification

pass, including this manual round (one stray ticket from a shell-scripting

mistake during verification was caught and cleaned up before finishing).



Git status: see the following commit for the recorded Phase 6a changes.



Next:



\- Begin Phase 6b — Ticket Management Frontend UI: scaffold the frontend

application (Vite/React/TypeScript/Tailwind per ADR-002/016 — not yet

started anywhere in the repo) and build the ticket list/creation/detail

pages against the Phase 6a API.



\---



\### 2026-09-16 — Phase 6b Ticket Management Frontend UI Implemented



Completed:



\- Planned first: engineering-lead produced a full Phase 6b plan, an

independent architect review challenged it (verifying the Vite-proxy

reasoning, correcting the cross-tab refresh rationale, and finding that the

`SafeUser` payload has no `isActive` flag), and the project owner approved

the revised plan decision by decision (D1–D9) before any code was written.

\- Scaffolded `frontend/` as a standalone Vite/React 19/TypeScript app with

Tailwind v4, React Router, TanStack Query and a native `fetch` client — no

state-management library, no form library, no component library, no axios

(ADR-002/008/016/017).

\- Pages: login, ticket list (URL-driven filters + limit/offset pagination),

ticket creation, ticket detail (edit, status, priority, assignment,

comments, staff-only history).

\- A Vite dev/preview proxy makes the API same-origin. This is the only

configuration in which authentication works at all: the backend enables no

CORS, `/auth/refresh` and `/auth/logout` reject a cross-origin `Origin`

header, and the refresh cookie is `SameSite=Strict`. `changeOrigin`, any

`rewrite`, and the separate `preview.proxy` key are each documented in

`vite.config.ts` as traps that silently break auth.

\- The access token lives in memory only; the refresh cookie stays httpOnly

and is never read by JavaScript (ADR-005). A page reload recovers the

session through a bootstrap refresh.

\- Refresh-on-401 is single-flight AND serialized across tabs via

`navigator.locks`, feature-detected with a fallback to plain in-tab single

flight. This is not decoration: re-presenting an already-rotated refresh

token makes `AuthService.refresh()` revoke the user's entire token family.

Two genuinely simultaneous refreshes are absorbed by the backend's

conditional update and merely 401; the dangerous case is a *serialized but

stale* presentation, which a second tab produces naturally.

\- Role-aware UI is presentation only and every gated action retains a

working 403 path (ADR-006/018). Internal notes are never rendered for an

Employee, and the query cache is cleared on every identity change so they

cannot survive a user switch in the same browser.

\- Status transitions mirror the backend matrix as a presentation-only

constant pinned by an exact-contents test, so backend drift fails loudly

instead of silently offering an action the server refuses. `Closed` remains

terminal for every role (ADR-019).

\- Guard tests fail the build on `dangerouslySetInnerHTML`/`innerHTML`/

`eval`/`Function()`/`srcdoc`/`on*` attributes/string timers, on MSW reaching

a production module, and on any use of web storage.

\- **No Phase 6a backend contract was changed.** The only backend additions

are `test/support/cleanup-e2e-tickets.ts` and the npm script that runs it.



Playwright data isolation (the owner rejected the original plan here, and

was right to):



\- The suite never seeds, resets or mutates data it does not own.

`global-setup.ts` verifies its preconditions — API healthy, the four seeded

accounts can sign in, at least one active category exists — and aborts with

instructions if not, telling the developer to run the seed themselves and

warning that it wipes data.

\- The category is resolved by name from the live response at runtime; no

seeded UUID is hardcoded.

\- Every ticket the run creates is tagged `[E2E][<runId>]`, assertions are

scoped to that ticket, and there are no global or unfiltered `total`

assertions.

\- Teardown deletes only `[E2E]`-prefixed tickets, relying on the declared

`onDelete: Cascade` relations, and is best-effort so it cannot mask a test

result. Matching the fixed prefix rather than one run's id means a crashed

run self-heals on the next one. The script now refuses to run against any

non-local database — the guard sits after the Prisma client is constructed,

because that is what loads `backend/.env` (`DATABASE_URL` is unset before

it, so the obvious placement would abort every legitimate local run).



Review findings (independent QA/Security and Senior Review, run in parallel

against the real code and a live browser):



\- **No CRITICAL and no HIGH findings from either reviewer.**

\- QA/Security verified all eight required security properties as holding,

most of them empirically: internal notes stayed invisible to an Employee

across a same-browser user switch and a mid-session expiry; `localStorage`,

`sessionStorage`, `document.cookie` and IndexedDB were all empty after

login; six tabs reloaded simultaneously produced 12 successful refreshes

and zero forced logouts; injected `<img onerror>`/`<script>` payloads

rendered as inert text; an injected 500 containing a stack trace and a

connection string surfaced only "Something went wrong".

\- 9 MEDIUM findings between the two reviewers (one — the unannounced live

region — found independently by both). All 9 were fixed, not deferred:

comment drafts destroyed on submit, drafts destroyed by tab switching, a

dead-end edit form after a 403, a categories outage blocking ticket

creation entirely, categories nested below the first level silently

vanishing from the picker, a half-used query-key factory, an e2e assertion

that could pass vacuously, an unguarded cleanup `deleteMany`, and the

live-region defect.

\- LOW/OPTIONAL items fixed as well: URL `categoryId`/`offset` validation,

XSS-guard hardening (`window.eval` was a real bypass), redirect

shape-checking, per-ticket page remounting, humanised status labels, a

tautological lock test replaced with three real ones, filter/picker

duplication, dead exports, misreported network errors, and a timeout that

covered headers but not the body.

\- Deliberately deferred with justification: history entries showing raw

UUIDs for assignee/category changes (staff-only, cosmetic, would need

frozen backend work), and the 20-second request-timeout path remaining

untested because jsdom's `AbortController` is incompatible with undici's

`fetch`. QA/Security confirmed the latter is an ordinary coverage gap, not

a Mandatory Gate #4 test exception — no bug was fixed, so no exception is

claimed or recorded.



Key decisions:



\- No new ADR. Every choice here is already covered by ADR-002/005/006/008/

016/017/018/019 or is a tactical, reversible implementation detail; an ADR

for "we used a Vite dev proxy" would be ADR inflation.

\- `vitest` was upgraded 3.2.7 → 4.1.11 to clear a moderate advisory

(GHSA-82fw-gwwq-j7x9 in `@vitest/mocker`). No security exception was needed

because a non-vulnerable version exists.

\- `shell: true` is kept in the e2e teardown's `spawn`. Since Node's

CVE-2024-27980 fix a `.cmd` shim cannot be spawned without it (verified:

EINVAL on Node 24). It is safe here because the command and arguments are

fixed literals and `cwd` is a spawn option, so nothing external is

interpolated.



Verification results:



\- `npx tsc --noEmit`, `npm run lint`, `npm run build`: all clean.

\- `npm test` (frontend): 9 files, **119 tests passing** (110 before the

review fixes; 9 added).

\- `npx playwright test`: 1/1 passing, teardown reported the cleanup and

left no `[E2E]` rows.

\- `cd backend && npm test`: **99/99 passing, unchanged.**

\- `cd backend && npm run test:e2e`: **67/67 passing, unchanged** against the

real local `opsnow_dev` Postgres — confirming no Phase 6a contract moved.

\- `npm audit` (frontend): 0 vulnerabilities.

\- `git diff c134b69 -- backend/` after the fix pass: one file, the cleanup

script. Nothing in `backend/src` or `backend/prisma` at any point.

\- Cleanup guard exercised both ways: refuses a remote `DATABASE_URL`

("refusing to delete from a non-local database"), works against localhost.

\- Data isolation proved independently of the suite: created an

`[E2E]`-tagged ticket WITH a comment, ran the cleanup, confirmed exactly one

ticket deleted via cascade while all 5 seeded tickets and 7 users survived.

Seeded counts confirmed unchanged after every run.



Known gaps, unchanged from earlier phases:



\- No CI pipeline anywhere in the project (Phase 15), so the Merge Readiness

Gate's "CI passes" item is met by locally-run checks only. This is a

documented, tracked, pre-existing gap and Phase 6b did not attempt to fix

it. The backend also still has no ESLint configuration.

\- Rate limiting on `/auth/login` and `/auth/register` remains deferred from

Phase 4 and must be closed before Phase 16.



Git status: committed as `c134b69` (implementation) and `a0ebf7e` (review

fixes), plus the documentation commit that follows.



Next:



\- Begin Phase 7a — SLA Management Backend API (see the entry below —

this has since been completed).



\---



\### 2026-09-16 — Phase 7a SLA Management Backend API Implemented (recovered from a power-cut interruption)



An unplanned power cut interrupted the implementation session mid-way

through wiring `SlaService` into `TicketsService`: two clean, tested

commits already existed (the pure SLA calculation/state-derivation layer,

and `SlaService`'s DB-access hooks), but the wiring commit itself was

uncommitted and left the build broken (a private `mapTicket` helper was

called five times but never defined) and its test file stale (constructor

signature mismatch). A recovery investigation (git worktree inspection,

diff review, targeted `npm run typecheck`) confirmed both existing commits

were sound and isolated the damage to exactly that one interrupted edit —

nothing was reset, discarded, or reimplemented from scratch.



Recovery and completion:



\- Wrote ADR-020 (DECISIONS.md), documenting the SLA architecture the two

recovered commits had already implemented but never recorded: policy

snapshotting at ticket creation, the two-clock (response/resolution)

model, due-date-shift pause semantics, the dual-purpose `onHoldStartedAt`

anchor (OnHold pause vs. resolved-pending-reopen), first-response

qualification (D3), the reopen pause-credit reuse (D4), priority-change

deltas, and the same-statement read-then-write concurrency invariants.

\- Completed the interrupted wiring: added the missing `mapTicket` helper,

registered `SlaModule` on `TicketsModule`, extended `TicketResponseDto`

with the SLA read-model shape, and updated `tickets.service.spec.ts` for

the new `SlaService` dependency with hook-ordering assertions for every

call site (create, first response, OnHold pause/resume, resolution,

reopen, priority change).

\- Added the two staff-only read endpoints: `GET /api/v1/sla-policies` and

`GET /api/v1/sla/metrics` (typed Prisma `count()` aggregates, scoped

through the same `ticketVisibilityWhere` as ADR-019), plus

`test/sla.e2e-spec.ts` against the real Postgres dev database.



Independent review (per the engineering constitution's Mandatory Gate #2

— separate QA/Security and Senior Review agents, neither involved in the

implementation) found one HIGH and several MEDIUM issues before this

phase was considered done:



\- **HIGH (fixed):** a first response recorded while a ticket was paused

compared the reply's timestamp against the still-unshifted due date,

which could permanently mis-record a breach for a genuinely on-time

response. Fixed by deciding breach from whether the pause itself started

after the due date had already passed, not from the reply's own timing.

\- **MEDIUM (fixed):** the reopen pause-credit anchor was written from the

application clock (`resolvedAt`) rather than the database clock, risking

clock-skew corruption of credited pause time on a reopen; the reopen path

also left a stale `resolutionBreached = true` flag uncleared, which the

new metrics aggregate would have double-counted. Both fixed in

`SlaService`.

\- **MEDIUM (fixed):** a priority change on an already-resolved ticket

could still shift SLA due dates on a completed clock; `handlePriorityChange`

now skips the entire delta (warn-and-skip, matching the existing

missing-policy pattern) once the ticket has resolved at least once.

\- **MEDIUM (fixed):** several new e2e tests asserted post-conditions that

could not actually fail if the mechanism they claimed to cover were

removed (a due-date shift never checked, a concurrency race assertion

that was genuinely flaky under real HTTP scheduling). Rewritten to assert

real due-date arithmetic, a non-flaky invariant for the concurrency test

(status ∈ {200, 409}, ≥1 success, history-row count matches success

count, final due dates match the commutative-delta invariant exactly),

and behavioral (before/after) metrics deltas instead of type-only checks.



All fixes are recorded in ADR-020 itself (Risks section) rather than

silently rewritten in, so the ADR remains an honest record of what the

design got right the first time versus what independent review caught.



Verification after fixes: `npm run typecheck` clean; unit tests 170/170;

e2e tests 91/91 (all against the real local `opsnow_dev` Postgres,

including new regression tests for every fix above); `npm run build`

clean; `npm audit` — 0 vulnerabilities; seed data (5 tickets, 4 SLA

policies, 7 users) confirmed unchanged after every test run.



No migration was created — `SlaPolicy`/`TicketSla` were already part of

the Phase 2 schema. Phase 7b (frontend) was not started; no frontend file

was touched. Work stayed on the recovered git worktree branch

(`worktree-agent-a57e68f9c940eddb3`); the two pre-interruption commits

were preserved untouched, and new commits were added on top rather than

amending or rebasing. Not yet merged into `main`.



Known gaps, unchanged or newly noted:



\- No CI pipeline and no backend ESLint configuration (pre-existing, see

the Phase 6b entry above).

\- The pause/reopen anchor's DB-clock-only invariant and the

resume-before-resolve hook ordering are both enforced only by code

discipline plus a regression test, not a schema-level constraint —

flagged as an accepted, revisitable risk in ADR-020.



Next:



\- Begin Phase 7b — SLA Management Frontend UI.



\---



\### 2026-09-16 — Phase 7b SLA Management Frontend UI Implemented



Phase 7a's SLA data is now visible and usable in the application. No

backend file was changed: Phase 7b consumes the Phase 7a contract exactly

as it stands, adds no endpoint, and adds no dependency of any kind.



What was built:



\- A new `frontend/src/features/sla/` feature: a pure presentation module

(`slaDisplay.ts`) that turns a backend SLA state into a badge, tone,

wording and countdown mode; a shared ticker (`slaTicker.ts`); the

receipt-instant anchor (`useSlaAnchor.ts`); the countdown, detail panel

and list indicator components; the staff-only query hooks and API

wrappers; and the SLA dashboard page.



\- Ticket detail page: an SLA panel in the existing sidebar showing both

clocks, each with its own badge, due date, target, completion instant

where it has one, and an explanatory line. Every state is handled,

including paused, paused-but-already-past-due, resolved/closed,

no-response, reopened, and no SLA at all.



\- Ticket list: one SLA badge per row — desktop table column and mobile

card — showing the more severe of the two clocks and always naming which

clock it refers to ("Response breached", "Resolution at risk"), never a

generic "SLA" label.



\- Staff-only SLA dashboard at `/sla`, consuming only the two existing

endpoints. The seven metric counts render as a definition list (no

charts) and the policies as a real table. The two sections load and fail

independently. The absence of an at-risk aggregate is stated plainly

rather than fabricated. A non-staff user gets no nav link, falls through

to the ordinary "page not found" on a deep link, and never issues either

request.



Rendering model (ADR-021):



\- The backend's `responseState`/`resolutionState` strings are

authoritative. Nothing in the frontend derives met/breached/at-risk from

a due date and the browser clock.



\- The countdown ages the backend's own `minutesRemaining` from an instant

captured locally the first time that exact payload is seen, keyed on the

payload's object identity — never from `dueAt - Date.now()`, and

deliberately never from TanStack Query's `dataUpdatedAt`, which is `0`

while `useTicketList` renders placeholder data and would age every row on

the page by decades.



\- Paused clocks show a frozen figure; finished clocks show no figure at

all. Neither subscribes to the ticker, so not ticking is structural.



\- One shared, visibility-aware 30-second interval drives every countdown

on the page, and a countdown reaching zero triggers no network request of

any kind.



Verification (all run in this worktree):



\- Frontend: `npm run typecheck` clean; `npm run lint` clean;

`npm run build` clean; `npm run test` — 16 files, 207 tests passed

(119 pre-existing, 88 new); `npm audit` — 0 vulnerabilities.



\- Playwright: `npm run test:e2e` — 2 passed (the pre-existing ticket

workflow plus a new SLA spec covering an Employee flow and a staff flow),

against the real backend and the real local `opsnow_dev` database. The

dashboard assertions are structural only; no global metric count is

asserted, because the developer's database is not state this suite owns.



\- Backend regression (nothing was expected to change, and nothing did):

`npm test` — 13 suites, 170 tests passed; `npm run test:e2e` — 6 suites,

91 tests passed against the real Postgres dev database; `npm audit` — 0

vulnerabilities.



\- Seed data confirmed unchanged before and after every run: 5 tickets,

4 SLA policies, 7 users, 5 ticket SLA rows, 3 comments. The Phase 6b

tagged-subject data isolation was preserved exactly; nothing seeds,

resets or wipes the development database.



\- Rendered in a real Chromium against the running dev stack for an

Employee and for a support agent, at desktop and phone widths, and the

screenshots inspected: the detail panel, the list column and card badge,

and the dashboard all render correctly. One seeded ticket happened to be

sitting in the reachable `Paused` + zero-remaining state, which rendered

with its own "Resolution paused — already past due" wording as designed.



Two regression tests were confirmed to actually bite by temporarily

breaking the code they guard: removing the local anchor made the

placeholder-data countdown test fail, and removing `enabled` from the SLA

query hooks made the "an Employee never requests staff-only SLA data"

test fail. Both were restored immediately.



Independent review (Mandatory Gate #2 — separate QA/Security and Senior

Review agents, neither involved in the implementation) returned no

CRITICAL and no HIGH findings. The MEDIUM and LOW findings were fixed in

a follow-up commit on the same branch:



\- **MEDIUM (fixed):** both clock-description switches were exhaustive

over the state unions but had no `default`, so an unrecognised state

string from the wire returned `undefined` and `summariseSla` threw on it.

With no error boundary anywhere in the app that throw would unmount the

whole React tree — one unknown state would blank the entire ticket list.

Both now degrade to a neutral "state unavailable" view that invents no

due-date wording and ranks lowest, so a real breach on the other clock

still wins the list badge. Compile-time exhaustiveness is preserved via a

`never` assignment in the new `default` arm, and was verified by

temporarily deleting a case and confirming the build fails.



\- **MEDIUM (fixed, documentation):** ADR-021 and the ticker's own comment

justified the no-refetch-on-zero decision partly on TanStack Query's

refetch-on-focus, which `lib/api/queryClient.ts` disables project-wide.

Both now state the real lifecycle (`staleTime` plus refetch-on-mount

only), and ADR-021's Consequences records the honest result: a tab left

open in the background can show "Due now" beside a badge that still reads

"on track" until the query remounts. The shared query configuration was

deliberately NOT changed — that is a behaviour change affecting every

ticket query, and it is tracked in TASKS.md as a decision for the project

owner.



\- **MEDIUM (fixed):** the at-risk explanatory copy restated the backend's

`AT_RISK_FRACTION` as prose, and restated it slightly wrong ("less than a

fifth" for a `<=` threshold). Both the panel note and the dashboard note

are now worded so they stay true whatever that constant is set to.



\- **LOW (fixed):** the dashboard keyed its spinners off `isPending`,

which stays true forever for a disabled query; switched to `isLoading`.

The paused-past-due note claimed absolutely that no time was left, which

is false for the sub-minute window the backend rounds to zero; softened.

The anchor's documentation said "first saw this payload" when it is

really "first rendered with this payload" — a difference of up to

`staleTime` — corrected in both the hook and ADR-021, along with a note

that identity-keying is what makes the ref write idempotent under

StrictMode. The zero-clamp comment now names the ordinary case it exists

for (a tick published before the countdown mounted), not just a backwards

system clock.



\- **LOW (fixed, tests):** added assertions that the ticker removes its

`visibilitychange` listener on last unsubscribe and registers only one

listener for many countdowns; that a list row renders exactly one SLA

badge rather than one per clock; and that an unknown state leaves

neighbouring rows and the other clock rendering normally.



Known gaps, unchanged or newly noted:



\- No CI pipeline and no backend ESLint configuration (pre-existing, see

the Phase 6b entry above).



\- There is no repository-wide guard test forbidding a string argument to

`setTimeout`/`setInterval`. The SLA ticker passes a function reference,

and the existing `src/test/guards.test.ts` already forbids `eval` and

`new Function`, but the string-argument form is not covered. Deliberately

left out of this phase's scope; now tracked in TASKS.md's "Deferred from

Phase 7b" list.



\- An SLA countdown in a long-lived background tab is not refreshed on

return, because `refetchOnWindowFocus` is disabled project-wide, so it

can read "Due now" beside a badge that still says "on track" until the

query remounts. Stale rather than wrong (the badge is the backend's last

word), recorded in ADR-021's Consequences and tracked in TASKS.md as a

decision for the project owner, since fixing it changes shared query

configuration affecting every ticket query.



\- The frontend's SLA state unions in `src/types/api.ts` mirror

`backend/src/sla/sla.constants.ts` by hand. An exhaustive switch catches

a state the frontend does not handle, but nothing mechanically keeps the

two declarations in step (recorded in ADR-021's Risks).



Next:



\- Begin Phase 8 — Asset Management.



\---


\## Resume Instructions



When continuing development, first read:



1\. `CLAUDE.md`

2\. `TASKS.md`

3\. `progress.md`

4\. `DECISIONS.md`



Then:



1\. Check Git status.

2\. Review recent Git history.

3\. Identify the current phase.

4\. Identify the first incomplete task.

5\. Inspect the existing implementation.

6\. Run relevant tests.

7\. Continue from the existing project state.



Do not restart completed work without verification.

