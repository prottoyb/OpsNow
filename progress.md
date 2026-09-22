\# OpsNow Development Progress



\## Current Status



Project status: In Progress



Current phase: Phases 13–16 complete; Phase 17 — Final Review & Portfolio

Preparation is complete for everything achievable from inside this

repository. Phase 17a/17a-2/17b (UI/UX Product Polish) and Phase 17c

(final review, documentation, verification and release preparation) have

both landed.



Current task: none



Last completed task: Phase 17c — Final Review, Documentation, Verification

and Release Preparation. See the dated log entry below for the full

account, including the final push/CI/release outcome.



Next task: none from inside this repository. What remains needs something

this repository cannot supply on its own — building the container images

on a machine that has Docker, and the external steps in

`docs/deployment.md` (a hosting account, a managed database, a registry,

a domain, a credential). See TASKS.md's Phase 14/16 sections.



Honest status of Phases 14 and 15: the container images have never been

built (Docker is not installed on this machine) and the CI pipeline has

never run (nothing has been pushed). Both are written and statically

checked. Treat the first `docker compose up` and the first CI run as

untried steps.



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


\### 2026-09-17 — Phase 8a Asset Management Backend API Implemented



Phase 8a adds asset management to the backend. It was deliberately scoped

as "another resource like Ticket": every model it needs (`Asset`,

`AssetType`, `AssetAssignment`, `TicketAsset`, the `AssetStatus` enum)

already existed in the Phase 2 schema, so this phase adds no migration,

and it reuses the approved ticket patterns rather than inventing new

ones, so it adds no ADR. That was the point of the scoping: a per-row

visibility helper and a compare-and-swap write are cheaper, and easier to

explain, than a policy engine.



Implemented:



\- `GET /api/v1/asset-types` — any authenticated user, active types only,

unpaginated, mirroring `ticket-categories` as the read-only

reference-table template.

\- `POST/GET/PATCH /api/v1/assets` and `GET /api/v1/assets/:id` —

staff-only writes, paginated `{data,total}` list with

`status`/`assetTypeId`/`assigneeId`/free-text `q` filters. Row-scoped by

`common/asset-visibility.ts`, a sibling of `common/ticket-visibility.ts`:

an Employee sees only assets currently assigned to them, staff see all

non-soft-deleted assets, and an out-of-scope or soft-deleted asset is a

404 rather than a 403, per ADR-019's safe-not-found rule.

\- `PATCH /api/v1/assets/:id/assignment` — the single seam every

assignment change funnels through, so `status` and `currentAssigneeId`

are only ever written together and the `AssetAssignment` ledger always

mirrors them. It uses the same read-then-conditional-`updateMany`

compare-and-swap as `TicketsService.assign`: a lost race is a 409, not a

silent overwrite. Assigning an `InRepair`/`Retired`/`Lost` asset is

rejected as validation (400) before the CAS, so the caller gets an

explanation rather than a generic conflict. Any active user may hold

equipment — deliberately not staff-only, since employees legitimately do.

\- `GET /api/v1/assets/:id/assignments` — staff-only, paginated. The

ledger IS the asset history; there is no separate audit model.

\- `GET/POST/DELETE /api/v1/tickets/:id/assets[/:assetId]` on the existing

`TicketsController`. The ticket lookup is routed through the existing

ticket-visibility helper first, exactly like `findComments`/`findHistory`,

so a ticket outside the caller's scope reveals nothing. Link and unlink

are both idempotent.



`PATCH /api/v1/assets/:id` may change status but never assignment, in

both directions — it rejects `status: "Assigned"` outright, and rejects

any status change while the asset is held. That is what stops `status`

and `currentAssigneeId` drifting apart behind the ledger's back. The

practical consequence for Phase 8b is that an edit form must omit

`status` unless it is actually changing.



Independent review (per the engineering constitution's Mandatory Gate #2

— separate QA/Security and Senior Review agents, neither involved in the

implementation) found one issue both reviewers reached independently,

plus several smaller ones:



\- **HIGH (fixed):** `GET /tickets/:id/assets` embedded the full asset

record, so an Employee who could see a ticket could read the

`serialNumber`, the staff-authored `notes`, and the identity of the

colleague holding an asset that `GET /assets/:id` correctly 404s for

them — the exact boundary `asset-visibility.ts` exists to enforce. Fixed

by returning a narrow `AssetSummaryResponseDto` (id, assetTag, name,

status, assetType) uniformly for every role, and by narrowing the link

query so the holder relation is not even loaded. A uniform shape was

chosen over a role-dependent projection deliberately: there is then no

per-role branch to get wrong, and the "the caller is responsible for

scoping" seam shrinks to ticket visibility alone. Covered by tests in

both directions, as an Employee and as staff.

\- **MEDIUM (fixed):** an explicit `null` on a non-nullable update field

passed validation (`@IsOptional()` skips validators for `null`, not just

for absence) and reached Postgres as a 500. Now a 400, with the four

genuinely nullable fields documenting clearing as a real capability

rather than an accident.

\- **MEDIUM (fixed):** out-of-range and non-string dates, and NUL/control

bytes in text fields, also reached the database and surfaced as 500s.

Both are now 400s. The control-character guard deliberately still allows

tab/newline/carriage return, since `notes` is multi-line free text.

\- **MEDIUM (fixed):** assignment `notes` submitted with a no-op

assignment were silently discarded behind a 200. That request is now

rejected rather than answered with a lossy success.

\- **MEDIUM (fixed):** the concurrency tests lacked failure power — the

transaction could have been deleted, or `status` dropped from the CAS

predicate, with every test still passing. The CAS-miss test now pins the

full `where` clause, the visibility test compares against the helper's

actual return value instead of a hardcoded literal, the transaction is

asserted, and a new e2e fires two concurrent assignments and asserts

exactly one winner with a single open ledger row matching the asset.

\- **LOW (fixed):** both CAS `where` clauses were built by spreading the

visibility clause last, which for a non-staff caller would have

key-collided with — and silently disabled — the `currentAssigneeId`

concurrency pin. Unreachable today because the staff check runs first,

but now built as `AND` clauses so it cannot happen structurally. Also

fixed: the lost link race reported the wrong resource in its error, an

unreachable `P2025` branch, and unescaped LIKE wildcards in `q`.



QA/Security separately confirmed by live probe that the compare-and-swap

genuinely prevents double-assignment rather than merely passing its test:

eight rounds of two concurrent assignments produced exactly one winner

every time, with one open ledger row consistent with the asset. Under

Read Committed the loser blocks on the winner's row lock and then

re-evaluates the predicate against the new row version, so pinning both

`currentAssigneeId` and `status` is what makes the outcome decisive — no

stronger isolation level is required.



Verification (run against the real local Postgres dev database):

`npm run typecheck` clean; 295 unit tests across 17 suites passing; 149

e2e tests across 7 suites passing; `npm audit` reporting 0

vulnerabilities; and dev/seed row counts (users, tickets, assets, asset

types, assignments, ticket links, comments) identical before and after

the e2e run. The backend has no lint script configured, so no lint step

was run and none was added.



Deferred, tracked rather than dropped:



\- The explicit-null and control-character validation gaps exist

project-wide in the ticket DTOs too, which Phase 8a's DTOs inherited

rather than invented. Fixing them there spans the settled ticket module,

so it belongs in a follow-up covering both rather than in this phase.

\- `assetInclude` fetches the whole `User` row (password hash included)

for the assignee relation. Nothing leaks — `toUserSummary` strips it, and

the specs assert so — but narrowing it requires changing

`toUserSummary`'s signature and every ticket-module call site, so it is

deferred to the same follow-up.

\- `STAFF_ROLES`/`isStaffRole` are imported into the asset domain from the

tickets module. No runtime cycle exists, and the reuse itself is correct;

only the location is awkward. Moving them to `common/` is mechanical and

was left out to keep this diff scoped.

\- Re-creating an asset with the `assetTag` of a soft-deleted asset

returns 409. Accepted deliberately: the route is staff-only and the tag

genuinely is taken.



Next:



\- Begin Phase 8b — Asset Management Frontend UI.



\---



\### 2026-09-17 — Phase 8b Asset Management Frontend UI Implemented



Phase 8b puts a UI on the Phase 8a API without changing one line of

`backend/src`. It reuses the Phase 6b ticket-frontend patterns

throughout — query keys namespaced by signed-in user id, URL-backed list

filters, `apiFetch` + `toApiError`, the shared `components/ui`

primitives — so it adds no ADR and no dependency.



Implemented:



\- `/assets`, `/assets/new` (staff-gated, rendering the ordinary

not-found page for an Employee) and `/assets/:id`, plus a nav entry

labelled "Assets" for staff and "My assets" for an Employee.

\- Asset list with status, type, free-text and assigned-to-me filters,

all held in the URL so a filtered list is shareable and survives

back/forward.

\- Asset detail with staff-only inline edit, a staff-only status control,

an assignment control, the staff-only assignment ledger tab, and the

404/400/403/409 branches the ticket detail page already models.

\- A linked-assets panel on ticket detail: staff get links, unlink and

"Assign to requester"; an Employee gets plain text only.



Decisions that shaped it:



\- There is no assignee picker. `GET /api/v1/users` is

Administrator-only, so a SupportAgent or TeamLead cannot enumerate

users at all — the same constraint the ticket `AssignmentControl`

already documents. The UI therefore offers only the three operations

every staff role can actually perform: "Assign to me", "Assign to

requester" (the requester id is already in the ticket payload) and

"Return to stock". A fuller assignment UI needs a staff-directory

endpoint first, which is deliberately not in this phase.

\- Status is a separate staff-only control, never a field in the

create/edit form. `PATCH /api/v1/assets/:id` validates `status`

whenever the key is present at all, so a form that PATCHed itself back

would 400 on every assigned asset.

\- An Employee never fires `GET /api/v1/assets/:id/assignments`; the

endpoint is staff-only and would only ever answer 403. Asserted by a

test that watches the actual request layer, not a mock spy.

\- Ticket-linked assets are not hyperlinked for an Employee.

`GET /api/v1/assets/:id` is row-scoped, so the link would usually

dead-end on a 404 — and the 404 is itself the information boundary.



Testing:



\- 75 new component/unit tests (26 files / 282 total, up from 207).

The security-relevant ones assert against real captured request

bodies rather than mock call arguments.

\- A new Playwright journey: the employee raises a tagged ticket, the

agent creates a tagged asset, assigns it, returns it, links it, and

the employee — in a separate browser context, since the refresh

cookie is httpOnly and SameSite=Strict — sees it read-only.

\- `cleanup-e2e-tickets.ts` became `cleanup-e2e-data.ts` and now also

removes assets tagged `E2E-`, relying on the existing cascades. It

keeps its fail-closed local-database guard and remains scoped

deletion, never a reset: a full run was verified to leave the seeded

assets, asset types and tickets untouched.



Known limitations:



\- No asset deletion or decommission UI, and no AssetType CRUD — asset

types stay a read-only lookup.

\- An Employee sees no assignment history, not even their own.

\- "Assign to requester" is offered only while the asset is in stock,

because the narrow ticket-linked summary carries no `currentAssignee`

to compare against.



Next:



\- Begin Phase 9 — Knowledge Base.



\---



\### 2026-09-21 — Phase 9 Knowledge Base Implemented (backend API and frontend UI)



Phase 9 was built in the two halves the previous phases established — 9a the

backend API, 9b the frontend UI — and was interrupted twice by session

limits. Both halves were recovered from the interrupted agents' worktrees,

re-verified from scratch against the repository rather than from

conversation memory, and only then marked complete.



Implemented (9a — backend):



\- `GET /api/v1/kb-categories` exposing the seeded category tree read-only,

alongside `ticket-categories` and `asset-types`.



\- `POST|GET|PATCH /api/v1/kb-articles` and `GET /api/v1/kb-articles/:id`,

with list filtering by status, category, author and free-text search, and

the usual pagination envelope.



\- `POST /api/v1/kb-articles/:id/feedback` (any reader who can see the

article) returning only the aggregate counts, and a staff-only

`GET /api/v1/kb-articles/:id/feedback` returning the raw log.



\- `GET|POST /api/v1/tickets/:id/knowledge-articles` and

`DELETE /api/v1/tickets/:id/knowledge-articles/:articleId`, the write

routes staff-only and idempotent in both directions.



\- `common/knowledge-article-visibility.ts`, a sibling of

`ticket-visibility.ts` and `asset-visibility.ts`, exporting the same

visibility rule twice: as a Prisma `where` and as a `Prisma.Sql`

predicate for the raw full-text-search path.



Implemented (9b — frontend):



\- `/kb`, `/kb/new` and `/kb/:id`, plus a nav entry, reusing the Phase

6b/8b patterns throughout: URL-backed list filters, per-user query keys,

`apiFetch` + `toApiError`, the shared `components/ui` primitives.



\- Article detail with staff-only inline editing, a status control visible

only to the editorial roles, a feedback widget for every reader, and the

staff-only feedback log.



\- A knowledge-articles panel on ticket detail: staff can search, link and

unlink; an Employee sees the linked published articles as plain text.



Decisions that shaped it — recorded in full as ADR-022:



\- Status is the visibility rule (an Employee sees only `Published`), the

boundary is a 404, and the rule is defined once in two dialects because

`search_vector` is a tsvector column Prisma cannot query.



\- Authoring is two-tier: a SupportAgent writes and edits their own

articles; only a TeamLead or Administrator edits someone else's or

changes status. Editing a colleague's article is a 403, not a 404,

because the agent can legitimately read it.



\- There is no DELETE. `Archived` is the retire path, and an archived

article comes back through `Draft`, never straight to `Published`.



\- Search is PostgreSQL `websearch_to_tsquery` + `ts_rank` over a stored

generated column — no search service, per ADR-017.



\- `viewCount` is a raw best-effort UPDATE, because an ORM increment would

move `updated_at` on every read and fire spurious 409s at an editor.



Testing:



\- Backend: 474 unit tests across 23 suites pass, including the

knowledge-base service, controller, DTO validation, slug/excerpt text

helpers and the transition matrix.



\- Backend e2e: `test/kb.e2e-spec.ts`, 91 tests, covering every role

against every route — including that a Draft is a 404 for an Employee

through the search path as well as the ORM path, that the feedback log

never reaches a non-staff caller, and that linking leaks nothing about a

ticket outside the caller's scope. It ends by asserting the three seeded

articles are still present and untouched.



\- Frontend: 358 tests across 30 files pass; typecheck and lint are clean.



Known limitations:



\- No category CRUD, no soft-delete route (`deletedAt` is read but never

written), and no ranking beyond `ts_rank` — no synonyms, fuzzy matching

or typo tolerance, and the dictionary is hard-coded to `english`.



\- No Playwright journey for the knowledge base yet; the e2e directory

covers tickets, SLA and assets. Phase 13 owns end-to-end coverage.



Next:



\- Begin Phase 10 — Dashboard & Analytics.



\---



\### 2026-09-21 — Phase 10 Dashboard & Analytics Implemented (backend API and frontend UI)



Phase 10 was built in the two halves the previous phases established — 10a

the backend API, 10b the frontend UI. Like Phase 9 it was interrupted by a

session limit, this time mid-backend. The interrupted work was recovered

from the stalled agent's worktree, inspected, verified to typecheck, and

committed as its own checkpoint (`7a74d1e`) BEFORE any further work began,

so that the recovery could not be lost a second time. It was not recreated

and not discarded: the five files it contained are the design the rest of

the phase was built on.



Implemented (10a — backend):



\- `GET /api/v1/analytics/tickets` — totals, counts by status and by

priority, opened versus resolved in the window, mean and median

resolution minutes, and backlog.



\- `GET /api/v1/analytics/sla` — response and resolution met/breached

counts with a compliance rate, plus the pause-aware at-risk and

in-flight-breached counts that ADR-020 explicitly deferred to this phase.



\- `GET /api/v1/analytics/categories` and `GET /api/v1/analytics/agents` —

per-group volume, resolved count, average resolution minutes and SLA

figures, ordered by volume and capped with a `truncated` flag.



\- `common/ticket-visibility.ts` gains `ticketVisibilitySql`, the ADR-019

rule expressed a second time as a `Prisma.Sql` predicate for the three

aggregates Prisma cannot express, defined immediately beside its ORM twin

for the reason ADR-022 gives for the same pattern.



Implemented (10b — frontend):



\- `/dashboard`, staff-only, with Tickets / SLA / Categories tabs and an

Agent performance tab visible only to a TeamLead or Administrator. Only

the visible tab fetches.



\- A shared filter bar — date range, priority, category, assignee — with

URL-backed state, so a filtered dashboard is linkable and survives

reload, and client-side range validation that mirrors the backend's

366-day and inverted-window rules rather than replacing them.



\- Dependency-free visuals: stat tiles, proportional bar rows and a

compliance meter, built from plain HTML and CSS. Every figure is also

rendered as text, bars expose `role="meter"` with an accessible name and

value, and no meaning is carried by colour alone.



Decisions that shaped it — recorded in full as ADR-024:



\- Cohorts are defined explicitly. The window selects tickets created in

it, except that `total` and `backlog` ignore the window (a backlog is a

statement about now) and `resolved` plus the resolution averages select

on `resolvedAt`. `opened` and `resolved` in one window are therefore not

two views of one cohort and deliberately do not reconcile.



\- A rate or duration with nothing to compute from is `null`, never `0`.

On a dashboard, rendering "no completed clocks" as 0% would read as total

failure — the most alarming possible rendering of no data. Both cases are

asserted explicitly in the frontend tests.



\- The at-risk aggregate is pinned in both directions: its TypeScript

predicates against `deriveResponseState`/`deriveResolutionState` over a

scenario table, and its SQL against the live per-ticket API in e2e, so a

dashboard total cannot contradict the badge on the tickets it counts.



\- `/analytics/agents` is TeamLead/Administrator only — narrower than the

other three routes — because ranking named colleagues is line-management

information, not operational information.



\- No materialized view, cache or scheduled job; no charting library; no

migration and no new model.



Testing:



\- Backend: 539 unit tests across 27 suites pass, 65 of them new across

four analytics specs, including an 18-row scenario table pinning the

at-risk predicates against the SLA read model.



\- Backend e2e: 281 tests across 9 suites pass, 41 of them in

`test/analytics.e2e-spec.ts` — every role against every route, eight

validation cases, and the at-risk SQL checked against the per-ticket API

at each step as a ticket is driven to at-risk, paused and breached.



\- Frontend: 395 tests across 32 files pass; typecheck, lint and build

clean.



\- The e2e suite creates tickets tagged `E2E-ANALYTICS-<ts>`, cleans up

only those, aborts with an actionable message if the database is not

seeded, and ends by asserting every pre-existing ticket is still present

with an unchanged `updatedAt`. Nothing is reset or reseeded.



Known limitations:



\- Resolution time is wall-clock and does not subtract paused time, so a

ticket parked awaiting a user reply reports longer than the work took.



\- Agent SLA compliance uses the resolution clock only.



\- The filter bar offers only "Assigned to me", because `GET /api/v1/users`

is Administrator-only and no staff directory endpoint exists — the same

limitation already deferred from Phases 6b and 8b.



\- No trend charts, no drill-down from a figure to the ticket list, no date

presets.



\- The at-risk e2e test asserts on aggregate deltas against the shared

development database, so it depends on no pre-existing ticket crossing

the threshold during its run.



\- The dashboard was verified through the test DOM only; it was not opened

in a browser, so layout and overflow are untested visually.



Next:



\- Begin Phase 11 — Audit Logging.



\---



\### 2026-09-21 — Phase 11 Audit Logging Implemented (backend and UI)



Phase 11 activates the `AuditLog` model that had sat unused in the schema

since Phase 2. No migration was added. The backend and the UI were built as

two separate efforts, the UI against the merged backend contract.



Implemented (backend):



\- `audit/` with an allow-list sanitiser, typed event builders, the event

service, filter construction, and an Administrator-only read API.



\- Authentication events: login succeeded/failed, logout, token refreshed,

token refresh failed (reuse detected, expired, user inactive), and

registration.



\- Ticket events: created, updated, status changed, priority changed,

assigned, unassigned. Asset assigned and returned, which fell out of the

same service cheaply.



\- `access.denied`, recorded by `RolesGuard` — now async — for an

authenticated caller refused on a `@Roles` route. It stores the actor

role, required roles, method and route *pattern*, never the concrete URL

or query string.



\- `GET /api/v1/audit-logs`, Administrator-only, filtering by actor,

action, entity type, entity id, outcome and date range, using the

standard pagination envelope and exposing the actor as a user summary

with no email.



\- `IsNotBeforeFrom` was lifted out of the analytics DTO into

`common/validators/` so both DTOs share one implementation.



Implemented (UI):



\- `/audit`, Administrator-only, with a readable table, a details expander

carrying metadata plus IP and user-agent, URL-backed filters and

pagination. The nav entry is Administrator-only.



\- The frontend cannot import backend code, so the closed action list is

mirrored in `types/api.ts` — and `auditActions.test.ts` reads the backend

constants file and fails if the two ever diverge.



Decisions that shaped it — recorded in full as ADR-025:



\- Secrets are excluded structurally at three independent layers, not by

care at each call site: typed builders that cannot accept a request body

(`loginFailed` has no password parameter, so the worst bug is

unrepresentable), a fifteen-key allow-list that also rejects nested

objects so a body cannot be smuggled under an allowed key, and

value-pattern redaction for bearer tokens, JWTs, argon2 hashes and long

hex runs arriving inside a permitted field.



\- A failed login keeps the submitted identifier — brute-force

investigation needs it — but never the password, its hash or its length,

and `actorId` stays null rather than blaming the targeted account.



\- Audit writes are best-effort, after the primary operation commits and

outside its transaction, and `record()` never rejects. Enrolling them in

the transaction would let a logging problem roll back valid logins.



\- Ticket rows record which fields changed, never subject or description

text, which already lives in `ticket_history`.



\- The read API is Administrator-only rather than staff-only, and the log

is append-only with no update or delete route.



Testing:



\- Backend: 594 unit tests across 31 suites pass, including sentinel tests

on the sanitiser, the service and the auth service.



\- Backend e2e: 309 tests across 10 suites pass, 28 of them in

`test/audit.e2e-spec.ts` — the role matrix, filter validation, real login

/failed login/ticket create/update/assignment producing the right rows,

and a scan of every row and of the API output for the sentinel passwords,

the argon2 hash and the access, refresh and stored token hashes.



\- Frontend: 421 tests across 34 files pass; typecheck, lint and build

clean. A test feeds `<img src=x onerror=…>` through a metadata field and

asserts it renders as text with no element in the DOM.



Known limitations:



\- The existing e2e suites now leave audit rows behind in a developer

database, because logging in and acting generates them and those suites

know nothing about audit cleanup. The audit suite cleans up after itself.

Pruning the rest is left as a deliberate human decision.



\- An event can be lost if the insert fails or if the process dies between

the primary commit and the audit write. Rejected operations (400/409) and

unauthenticated 401s are not recorded.



\- Comment, knowledge-article link and asset-to-ticket link events are not

instrumented.



\- IP and user-agent are null on ticket and asset events, and `req.ip` is

the proxy address behind a reverse proxy since `trust proxy` is not set.



\- The `outcome` filter is unindexed, because outcome lives in `metadata`

to avoid a migration.



Next:



\- Begin Phase 12 — AI Ticket Assistant (architecture already recorded as

ADR-023).



\---



\### 2026-09-22 — Phase 12 AI Ticket Assistant Implemented (backend and UI)



Phase 12 adds this project's first dependency on a system outside its own

database. The backend landed first and is described by ADR-023; this entry

covers it and the staff-facing UI that now consumes it. No migration, no

new npm dependency on either side, and no new endpoint for the UI.



Implemented (backend):



\- `ai/` as a read-only side car: it imports Prisma and the knowledge base,

no ticket route calls it, and it never calls `TicketsService` — so an AI

outage, timeout or rate limit cannot make ticket work fail.



\- A narrow provider boundary. `AiProvider` is a transport with a single

`generate()`; prompt assembly, output parsing, grounding and validation

all live above it in vendor-neutral modules, so every safety-relevant

line is the same for every provider and is exercised by tests against a

fake transport.



\- Three providers: disabled (the default with no key, which throws rather

than inventing output), mock (explicit opt-in, rejected by Joi in

production), and a live adapter written against `fetch` with an

`AbortController` timeout rather than a vendor SDK.



\- `GET /ai/status` plus staff-only `POST /tickets/:id/ai/{triage,`

`draft-response,resolution-summary}`, all advisory: an e2e test asserts a

ticket's priority, category, status, `updatedAt`, history count and

comment count are unchanged after every AI route is called.



\- Failures are a 503 carrying a reason enum and no retries; nothing about

a prompt, a completion or a key is ever logged.



Implemented (UI):



\- A staff AI assistant panel in the ticket detail page's main column with

three human-triggered actions, their results labelled as generated and

unverified, and related knowledge articles linked through.



\- The three task routes are wired as mutations rather than queries. This

is a safety property, not a style choice: each call costs money and

sends ticket text to a third party, so it must fire on a click and at no

other time, and a query would re-run on mount, on remount, on

invalidation and on retry.



\- Reading a 503's reason needed one deliberate detour. `ApiError`

replaces any 5xx body with a generic message so no server internals

reach the UI, but keeps the parsed body on `.raw` — so the reason is

read from there, defensively, gated on `code === 'AI_UNAVAILABLE'` so a

gateway 503 is never rendered as an assistant rate limit. An

unrecognised reason degrades to assistant-shaped copy and the

unvalidated string is never echoed back.



\- Fail-closed on every branch: the panel is staff-only, `useAiStatus` is

additionally gated on `isStaff` so the "an Employee issues no AI

request" invariant does not depend on future call sites, and a status

query that errors renders the same quiet note as an unconfigured server

rather than a red alert over an optional helper.



\- Nothing in the feature can change a ticket. Applying a suggestion calls

back into the ticket page's existing update mutations, so it travels the

same validation, history-write and 403/409 path as a typed change, and a

suggestion the ticket already matches offers no button.



\- A generated draft renders read-only and is never wired into the comment

composer — it is written to be sent to a requester, so it must pass

through a person's hands.



\- The frontend mirrors the backend's closed failure-reason and mode lists,

and a drift guard parses `backend/src/ai/ai.types.ts` and fails if they

diverge — the same technique Phase 11 used for audit actions.



Decisions:



\- ADR-023's Decision 12 recorded Phase 12 as backend-only, on the grounds

that the task list named no frontend items. The project owner asked for

the UI, so the phase is now split 12a/12b like every phase since Phase 6

and the ADR is amended in place rather than left contradicting the built

state. Nothing else in ADR-023 changed; the UI consumes the contract as

designed, and the prediction that `enabled` would let a frontend carry no

role logic of its own held.



Verification:



\- Backend: typecheck clean, 731 unit tests across 39 suites, 342 e2e

tests across 11 suites, `nest build` clean. The backend has no lint

script — `tsc --noEmit` is the static gate there.



\- Frontend: typecheck clean, eslint clean, 459 vitest tests across 37

files (36 of them new for this feature), production build clean.



Deferred (also recorded in TASKS.md):



\- No copy-to-clipboard button on the draft; it is selected and copied by

hand from a read-only textarea.



\- No AI output is persisted, so a draft is lost on refresh, suggestions

are not auditable afterwards, there is no acceptance-rate analytics and

repeated clicks re-bill.



\- A failed status request is deliberately indistinguishable from an

unconfigured server.



\- The assistant appears only on the ticket detail page: no bulk triage,

no assistant on the list, none at creation time.



Next:



\- Begin Phase 13 — Testing & Quality.



\### 2026-09-22 — Phase 13 Testing & Quality Hardening



Phase 13 adds no features. It closes correctness, security and

test-coverage debt that earlier phases recorded and moved past, and puts

the two static gates the project was missing in place. Nothing was

refactored for taste.



Implemented:



\- Control-character validation now covers the fields it had not reached.

The `NoControlCharacters` validator existed since Phase 8a but was

applied only to the asset and knowledge-base write DTOs. A NUL byte in a

ticket subject, description or comment body, in a registration name, or

in either free-text search term (`GET /assets?q=`, `GET /kb-articles?q=`)

therefore reached Postgres, which cannot represent `0x00` in text

(SQLSTATE 22021); Prisma raises `PrismaClientUnknownRequestError`, which

no service's `mapPrismaError` handles, so the request became an unhandled

500. That quietly defeated the "no raw driver error reaches a client"

property the services otherwise hold. The registration name fields also

gained the `trim` transform every other text DTO already had.



\- Auth endpoint rate limiting (ADR-026), closing the brute-force gap

deferred since Phase 4. `@nestjs/throttler` on `/auth/login`,

`/auth/register` and `/auth/refresh` only — ten attempts per sixty

seconds per client by default, each route on its own counter. It is

deliberately not an `APP_GUARD`: a global limit on an authenticated ITSM

API would eventually rate-limit an agent's ordinary work in order to

protect endpoints the limit was never about. `GET /auth/me` is excluded

because an SPA polls it, and `POST /auth/logout` because throttling it

could strand a user in a session they are trying to end.



\- `TRUST_PROXY_HOPS`, because the throttle is only as good as `req.ip` —

which is also what every audit row records (ADR-025), with `trust proxy`

never configured (deferred from Phase 11). It is a hop COUNT, never

Express' boolean `true`: `true` believes the left-most `X-Forwarded-For`

entry, which any client can set, so it would hand an attacker both a

fresh throttle bucket per forged header and a chosen address in the

audit log. The default of 0 trusts nothing, so a deployment that forgets

to set it fails safe. Applied in `configureApp`, so the e2e bootstrap

cannot drift from `main.ts`.



\- Backend ESLint. Until now `tsc --noEmit` was the only static gate on

the backend, and the frontend was the only half of the project with a

linter. Type-aware rules are on; the promise family

(`no-floating-promises`, `await-thenable`, `no-misused-promises`,

`require-await`) are errors, because nearly every service method is async

and talks to Prisma, where an unawaited write is a silent data bug rather

than a type error. The first run found 39 problems across roughly 190

files, all minor — mostly redundant assertions in specs. `npm run lint`

runs at `--max-warnings 0`.



\- A frontend render error boundary. There was none, so any uncaught

throw during render unmounted the whole tree: the user lost the

navigation, the sign-out control and anything typed into a form, and saw

a blank page. One boundary is scoped to the routed page so the shell

survives, keyed on the pathname so navigating away clears it; a second

backstops the shell itself. Neither renders the thrown message or stack,

because a thrown value can carry whatever the failing code was holding.



\- A drift guard tying `FIELD_LIMITS` to the backend DTO caps, using the

same technique the Phase 11 audit-action guard uses. All ten agreed

already; nothing had been holding them together.



\- Playwright coverage for authentication and role-based access, which

the suite had never had — it had only ever signed in as a prerequisite

for testing something else. Eight tests: identical error text for a wrong

password and a non-existent account (so the form is not an enumeration

oracle), deep-link bounce and return, session survival across a reload

(which is what proves the `SameSite=Strict`, path-scoped refresh cookie

round-trips through the Vite proxy — a combination that breaks silently),

sign-out, per-role navigation as one table, and gated URLs typed directly

giving the ordinary "page not found" with no error alert.



Decisions:



\- ADR-026 records the rate-limiting and proxy-trust design, including

why account lockout and a global throttle were both rejected, and why

each throttled route keeps its own counter.



On tests and the throttle, which deserves stating plainly: every existing

e2e suite authenticates several role accounts back to back, well inside a

sixty-second window, so a production-sized limit would have produced 429s

that looked like defects in unrelated code. `test/support/jest-env.ts`

therefore raises `AUTH_THROTTLE_LIMIT` for the suites. That is a raised

threshold, not a disabled control: the guard still executes on every auth

route in every suite, and `test/auth-throttle.e2e-spec.ts` boots its own

application with a limit of 3 and asserts the 429 fires, keeps firing,

leaks nothing, spares `/auth/me` and `/auth/logout`, and creates no

account or session. That spec has to import `AppModule` dynamically —

`ConfigModule.forRoot()` validates `process.env` while `app.module.ts` is

being evaluated, so a top-level import would pin the configuration before

the spec could lower the limit and the suite would pass for the wrong

reason.



Verification:



\- Backend: typecheck clean, lint clean at `--max-warnings 0`, 814 unit

tests across 42 suites (up from 731/39), 349 e2e tests across 12 suites

(up from 342/11), `nest build` clean, `prisma validate` clean.



\- Frontend: typecheck clean, eslint clean, 481 vitest tests across 39

files (up from 459/37), production build clean, 11 Playwright tests

against a live local stack (up from 3).



\- Database left as found: 7 users, 5 tickets, 4 SLA policies, 5 ticket

SLA rows, 3 comments, 5 assets, 3 articles — identical before and after.

Playwright teardown removed exactly the 3 tickets and 1 asset the run

created. `audit_logs` and `refresh_tokens` grew, which is the known

append-only behaviour tracked from Phase 11.



Not done, deliberately:



\- No broad accessibility rework. The audit found the existing UI already

carries real labels, `aria-describedby`, `aria-invalid`, `role="alert"`

error regions, an accessible spinner name and a skip link, so there was

nothing worth churning. Two genuinely missing things were added instead

(the error boundary and the drift guard).



\- The Phase 7 SLA clock-domain finding (`resolvedAt` is set from the app

clock while the SLA due dates it is compared against are DB-clock) is

still open. It is a real design flaw but needs a change to

`applyStatusTransition`'s timestamp source and a re-reading of the pause

ledger, which is Phase 6a/7a territory rather than hardening.



Deferred (also recorded in TASKS.md):



\- The throttle counter is per process, so more than one replica

multiplies the effective limit.



\- A 429 writes no audit row, so blocked attempts are invisible in the

one place an operator would look for an attack.



\- The local Playwright suite needs the backend started with a raised

`AUTH_THROTTLE_LIMIT`; `global-setup.ts` prints the command but it is a

manual step.



\- `refresh_tokens` and `audit_logs` keep growing across e2e runs.



Next:



\- Phase 14 — Docker.



\### 2026-09-22 — Phase 14 Docker



Containerisation of both halves plus a Compose stack that runs the whole

application locally. No application code changed.



Implemented:



\- `backend/Dockerfile`: `deps` → `build` → `prod-deps` → `runtime`, plus

a separate `migrator` target. Debian slim rather than Alpine, because

Prisma ships a different query engine for musl and the Alpine variant is

the one that fails at runtime with a missing-engine error that does not

reproduce on a developer's machine. `prisma generate` runs in the build

stage and the generated client is copied onto a production-only

dependency tree, so the Prisma CLI — a devDependency — never ships. The

process runs as the image's `node` user, which owns none of the

application files, and `CMD` is exec-form `node dist/main` so it is PID 1

and receives SIGTERM; that is what `enableShutdownHooks()` needs to close

the Prisma pool, and `npm start` would swallow it. Its health check calls

the real `/api/v1/health`, which pings the database, so an API that is up

but cannot reach Postgres reports unhealthy rather than ready.



\- `frontend/Dockerfile`: Vite build, then nginx. `npm run build` runs

`tsc --noEmit` first, so a type error fails the image rather than

shipping — the image must not become a way around a gate CI enforces.

There is no build argument for an API base URL, because the client calls

a hardcoded relative `/api/v1` and an absolute origin would reintroduce

every cross-origin failure the proxy exists to avoid.



\- `frontend/nginx.conf`: serves the SPA with a history fallback and

proxies `/api` to the backend. Three lines are load-bearing and each is

commented in place — `proxy_set_header Host $http_host` (not `$host`,

which drops the port, and not nginx's default, which rewrites it to the

upstream name; the backend compares `Origin` against `Host`),

`proxy_pass` with no URI part and no rewrite (the refresh cookie is

scoped to `path=/api/v1/auth` and the browser matches that against the

URL it sees), and `index.html` served `no-store` so a stale copy cannot

pin a browser to a deleted fingerprinted asset. These are the same three

traps `vite.config.ts` already documents for the dev proxy. It also sends

nosniff, Referrer-Policy, X-Frame-Options and a CSP that permits no

inline script.



\- `docker-compose.yml`: postgres, a one-shot `migrate`, backend,

frontend, ordered by Compose conditions rather than sleeps. Migration is

its own service running `prisma migrate deploy` — never `migrate dev` or

`db push`, both of which can drop and recreate a schema to make it match

— so it runs once regardless of replica count and a failure looks like a

failed migration rather than a crash-looping API.



\- `.env.docker.example` plus a `.gitignore` exception for it.

`POSTGRES_PASSWORD` and `JWT_ACCESS_SECRET` have no defaults, so Compose

refuses to start rather than run on a placeholder. `.dockerignore` on

both sides excludes `.env`, so a local secrets file cannot reach a layer.



\- `.gitattributes` pinning Dockerfiles, `.dockerignore`,

`docker-compose.yml`, `*.conf`, workflow YAML and `*.sh` to LF. This

repository is developed on Windows with autocrlf, and a trailing carriage

return inside a GitHub Actions `run: |` block becomes part of the command

and fails with `$'\r': command not found`. Deliberately not a blanket

`* text=auto`, which would renormalise every file in one commit and bury

real changes.



Decisions:



\- No ADR. Nothing here re-decides an architectural question: the images

follow the application's existing shape, and the one genuinely

consequential constraint — that the API must be same-origin — was already

decided in Phases 4 and 6b and is documented in `vite.config.ts`. The

Compose file and `docs/docker.md` restate it where an operator will meet

it.



Verification — and the honest limits of it:



Docker is NOT installed on this machine (`docker` is not on PATH and

Docker Desktop is not present), so no image has been built and the stack

has never been started. Nothing below should be read as "it works".



What was actually checked:



\- `docker-compose.yml` parses as YAML; its services, published ports,

health-check forms and `depends_on` conditions were inspected

programmatically.



\- argon2 is the only native dependency, and it ships prebuilt N-API

binaries for `linux-x64` and `linux-arm64` in both glibc and musl

flavours — so the images correctly need no compiler toolchain.



\- Both production bundles build cleanly.



\- The compiled backend was booted with `NODE_ENV=production` and probed:

`/api/v1/health` reported the database up, and the auth throttle answered

401/401/401/429 against a limit of 3. The probe's three failed-login

audit rows were deleted afterwards; seed data untouched.



\- `frontend/nginx.conf` has NOT been syntax-checked by nginx.



That production boot also surfaced something for Phase 16: Swagger is

served at `/api/docs` with `NODE_ENV=production` and answers 200, which

publishes the entire API surface. That is a deployment policy question,

so it is being fixed in Phase 16 rather than here.



Deferred (also recorded in TASKS.md):



\- Build and start the stack on a machine with Docker.



\- `nginxinc/nginx-unprivileged` instead of `nginx:alpine`, so no process

runs as root.



\- No registry, tagging or versioning scheme for the images.



\- Single replica of everything; the auth throttle and the AI concurrency

cap are both per-process.



Next:



\- Phase 15 — CI/CD.



\### 2026-09-22 — Phases 15 and 16: CI/CD and Deployment Posture



\#### Phase 15 — CI/CD



`.github/workflows/ci.yml`, five jobs on push and pull request:

`frontend` (typecheck, eslint, vitest, build); `backend` (prisma

validate, generate, `migrate deploy`, `migrate status`, seed, typecheck,

eslint, unit, e2e, build — against a Postgres service container with a

health-gated start); `browser-e2e` (builds and starts the compiled API,

polls the real health endpoint rather than sleeping, installs chromium,

runs Playwright, uploads traces and the API log on failure);

`dependency-audit` (`npm audit --omit=dev --audit-level=high` on both

packages); and `docker` (builds the backend runtime and migrator images

and the frontend image with buildx, renders `docker compose config`, and

syntax-checks `nginx.conf` inside the same nginx version the image uses).



The `docker` job carries more weight than it normally would: Docker is

not installed locally, so CI is the first place the Phase 14 images will

actually be built and the first place the nginx config will be checked.



Two decisions recorded rather than left to be inferred. `migrate status`

runs after `migrate deploy`, to catch a `schema.prisma` edited without a

matching migration — which otherwise passes every test and then fails at

deployment. And seeding is required here while being forbidden locally:

the difference is the database, not the command. `prisma db seed` calls

`resetData()`, which deletes every table — unacceptable against a

developer's `opsnow_dev`, correct against a service container created

seconds earlier and destroyed when the job ends. The e2e suites sign in

as the seeded role accounts, so without it they cannot run at all.



The `browser-e2e` job leaves `NODE_ENV` unset deliberately. Under

`production` the refresh cookie is marked `Secure`, a browser will not

send a `Secure` cookie back over plain http, and every session would die

on reload — a failure with nothing to do with the code under test. It

also raises `AUTH_THROTTLE_LIMIT`, which is a raised threshold and not a

disabled control; the backend job's `auth-throttle.e2e-spec.ts` is what

proves the limit fires.



No credentials anywhere. The Postgres password and JWT value are literal

throwaways for a container that exists for one job, labelled as such, and

written at each use because GitHub does not expose the `env` context

inside a `services:` block. `permissions: contents: read` is declared

explicitly rather than inherited from the repository default.



There is deliberately no deployment job — see Phase 16.



\#### Phase 16 — Deployment posture



Three code changes, all of them things a deployment gets wrong by

default, so the safe value is now the default rather than something an

operator has to remember:



\- **Swagger is off by default in production.** Booting the compiled

build during Phase 14 showed `/api/docs` answering 200 under

`NODE_ENV=production`: a complete, unauthenticated, machine-readable

description of every route, role gate, parameter and response shape. It

is now opt-in via `SWAGGER_ENABLED`, and on by default outside

production. The default is inverted by environment because the failure

modes are asymmetric — a developer who must remember to turn docs ON

loses five minutes; an operator who must remember to turn them OFF

publishes the API surface indefinitely without noticing. Enabling it in

production still works and logs a warning, because otherwise nothing

would ever say it had happened.



\- **Liveness and readiness are now separate.** `GET /health` keeps the

database ping and is readiness; `GET /health/live` checks nothing and is

liveness. An orchestrator RESTARTS a container that fails liveness, so a

liveness probe that pings Postgres turns a brief database blip into a

rolling restart of every instance, at exactly the moment the database is

least able to absorb a reconnect storm.



\- **`debug` and `verbose` logging are dropped in production.** They are

noise at volume and cost money in a pipeline, but the deciding reason is

that they are the levels most likely to carry request detail nobody

reviewed for what it discloses.



Both policies live in `main.policy.ts` rather than inline in

`bootstrap()`, because `bootstrap()` cannot be imported without starting

an application and a database — so a policy written there is a policy

that is never verified. `main.policy.spec.ts` covers both.



Decisions:



\- ADR-027 records the posture. The deployment model is SAME-ORIGIN and a

split-origin deployment is explicitly unsupported: the `SameSite=Strict`

path-scoped refresh cookie, `assertTrustedOrigin()` and the hardcoded

relative `/api/v1` all assume it, and CORS cannot fix a cookie. Production

CORS is therefore disabled, and that IS the production CORS

configuration — an allow-list would merely appear to enable a

deployment that would fail at the first token refresh. Security headers

come from the edge rather than from helmet, with the trade-off stated

(a different topology must replicate them). And nothing is deployed, with

no deployment automation written against a target that does not exist.



\- `docs/deployment.md` is the operator-facing companion: the origin

model and why it is not negotiable, every environment variable with its

production value, why `TRUST_PROXY_HOPS` is dangerous in both directions,

the migration rules (deploy only; never dev, push, reset or seed), the

absence of down-migrations and what that means for rollback ordering,

which health probe belongs where, what is and is not in the logs, a

pre-launch security checklist, and the ten external steps that each need

an account or a card.



Verification:



\- Against the compiled production build: `/api/docs` and

`/api/docs-json` both 404 with `NODE_ENV=production` and no override;

both 200 with `SWAGGER_ENABLED=true`, with the warning logged; readiness

200; liveness 200 returning `{"status":"ok"}`.



\- Backend typecheck, lint at `--max-warnings 0`, 823 unit tests across

43 suites, and `nest build` all clean.



\- The probe's three failed-login audit rows were removed afterwards;

seed data untouched.



What is NOT done, and will not be claimed:



\- **OpsNow is not deployed anywhere.** No hosting account, no managed

database, no registry, no domain, no credential. Ten of Phase 16's

eleven task-list items remain unchecked for that reason, and

`docs/deployment.md` says which external step unlocks each. (This entry

originally said nine; the count was corrected at the milestone close —

only "Configure production CORS" is checked.)



\- The CI pipeline has never run — nothing has been pushed.



\- The container images have never been built.



\- There is no way to create the first administrator through the API:

`POST /auth/register` always creates an `Employee`, the role is not

settable, and the seed script must never touch a deployment. A first real

deployment needs a one-off SQL promotion. A small `create-admin` CLI is

the right fix and is recorded as a gap.



Next:



\- Phase 17 — Final Review & Portfolio Preparation. NOT started.



\### 2026-09-22 — Milestone close: review fix, admin bootstrap, regression



Three things close the Phases 13–16 milestone. None of them is a new

feature.



\#### The Senior Review finding, and its fix



An independent Senior Review over the whole milestone found one HIGH and

nothing else outstanding. It is worth recording precisely because the bug

was in a file that reads as obviously correct.



`frontend/nginx.conf` set four security response headers —

`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and a CSP

— on the `server` block, and both the `/assets/` and `/` locations set

their own `Cache-Control`. nginx does not merge `add_header` down the

block hierarchy: a `location` that declares even ONE `add_header` of its

own discards the ENTIRE inherited set, not merely the directive it

overrides. So `index.html` and the whole JS bundle were being served with

no CSP, no framing protection and no nosniff, while the file looked as

though it set them globally — the only location that actually got them

was `/api/`, which declares no `add_header` and therefore still inherits.



Both locations now repeat all four headers verbatim alongside their

`Cache-Control`, the file header explains the inheritance rule so the

repetition is not "tidied up" later, and ADR-027's decision 7 records it.

Fixed in `5297e9c`, before this entry.



This has still never been checked by nginx itself: `nginx -t` is not

available on this machine, and CI's `docker` job is the first place the

config will be parsed.



\#### `create-admin` — the last recorded implementation gap



Phase 16 recorded that there was no way to create the first administrator

on a real deployment: `POST /auth/register` always makes an `Employee`

and does not accept a role, and `prisma db seed` calls `resetData()`,

which empties every table. The only bootstrap path was hand-written SQL

against production.



`backend/src/cli/create-admin.ts` replaces it. It promotes an existing,

non-deleted account to `Administrator` by email and does nothing else.



It promotes rather than creates so that it never sets a password, and

therefore never needs a second copy of the argon2 parameters or the

password policy — account creation stays entirely with the register flow.

It is a CLI rather than an endpoint because an endpoint that grants

`Administrator` must be guarded by something, and on a new deployment

there is no administrator to do the guarding; every way out of that

circle (a setup token, first-caller-wins, an env-gated route) is a

permanent privilege-escalation surface bought for a one-time need. Shell

access is already the higher privilege.



It lives under `src/cli/` rather than a `scripts/` directory so that

`nest build` ships it in the production image — `tsconfig.build.json`

excludes `**/*spec.ts`, so the test does not ship — and so Jest picks the

spec up with no configuration change. `node dist/cli/create-admin.js

<email> --yes`, or under Compose

`docker compose run --rm backend node dist/cli/create-admin.js <email> --yes`.



The safety posture is the substance of it, because this is aimed at a

real database at an awkward hour: an exact-match `yes` confirmation; a

refusal, not an auto-confirm, when stdin is not a terminal; `--dry-run`

that looks the account up and writes and prompts nothing; a disabled

account refused unless `--allow-inactive`, since promoting one produces

an administrator nobody can use and leaves a dormant privileged account

behind; an unknown flag treated as an error rather than ignored, so a

mistyped `--dry-runn` cannot turn a rehearsal into a real promotion; the

password hash never named in the `select`, so it is not read out of the

database at all; and a conditional `updateMany` pinned to the role that

was read, the same compare-and-set the ticket and asset services use, so

a row changed under the operator's confirmation loses the race instead of

being silently overwritten.



Verified against the real development database with dry runs only, with

all seven seeded users' roles snapshotted before and after and confirmed

identical: a padded mixed-case argument found `employee3@opsnow.local`

(proving the shared `normalizeEmail` path works against the

case-sensitive unique index), `admin@opsnow.local` reported the

idempotent no-op, an unknown address reported not-found with exit 1, and

the no-TTY invocation refused. `--help` exits 0; every malformed command

line exits 2.



Stated plainly rather than glossed: **the promotion is not written to

`audit_logs`.** `AuditAction` is a closed set mirrored into

`frontend/src/types/api.ts` behind a drift-guard test, so giving role

changes a first-class audit action is a cross-package change and was

judged out of scope for a bootstrap gap. The command prints a single

`RECORD` line — timestamp, user id, email, previous and new role — for

the operator to file in the deployment's change record, the file header

and the usage text both say so, and a test asserts the usage text keeps

saying so. It is tracked as its own deferred item in `TASKS.md`.



\#### The full regression



Run once, at the end, after the CLI landed. Everything below passed.



\- Backend: `prisma validate`; `prisma migrate status` (in sync, one

migration); typecheck; ESLint at `--max-warnings 0`; 864 unit tests

across 44 suites (41 of them new, from the CLI); 350 e2e tests across 12

suites; `nest build`.



\- Frontend: typecheck; ESLint; 481 vitest tests across 39 files;

`tsc --noEmit && vite build`; 11 Playwright tests in chromium.



\- `npm audit` on both packages: 0 vulnerabilities, both at the full tree

and at CI's `--omit=dev --audit-level=high` gate.



Four checks could NOT be run, and the milestone's claims are limited

accordingly. Docker is still not installed — confirmed again from both

the bash and the PowerShell PATH and at all three Docker Desktop install

locations — so no image was built and `docker compose config` was not

run. `nginx` is not installed, so `nginx -t` was not run. `actionlint` is

not installed. Instead, `.github/workflows/ci.yml` and

`docker-compose.yml` were both parsed as YAML and read line by line; the

workflow's five jobs, triggers and explicit `permissions: contents: read`

check out, every compose interpolation either carries a default or a

`:?` error (only `POSTGRES_PASSWORD` and `JWT_ACCESS_SECRET` are

required, and CI supplies both), and each Dockerfile build target CI and

Compose reference — backend `runtime`, backend `migrator`, frontend

`runtime` — was confirmed to exist. CI remains the first place all four

of those actually run.



The dev database was left as found. The Playwright teardown removed the

3 tickets and 1 asset its own run created, and nothing else; no seed was

run and no role was changed.



Next:



\- Phase 17 — Final Review & Portfolio Preparation. NOT started.



\---



\### 2026-09-22 — Phase 17a UI/UX Product Polish Implemented



The project owner manually used the application and judged its biggest

remaining weakness to be overall interface and product presentation, not

missing features. Phase 17's original checklist (security/performance/

accessibility/responsive review, dependency cleanup, docs, diagrams, demo

data, release) says nothing about UI/UX redesign, so this workstream —

Phase 17a — was inserted ahead of the rest of Phase 17 by explicit project

owner direction, using the V2 `ui-polish` workflow: designer audit →

implementation → designer second-pass review → one correction pass →

engineering verification → Senior Review.



Presentation-only throughout: `git diff --stat` against `backend/` across

every commit in this workstream is empty. No API, auth, RBAC, ticket/SLA/

asset/KB/analytics/audit/AI-assistant behaviour, or database schema

changed.



\*\*Initial audit\*\* (`ui-ux-product-designer`, code-level — no dev server or

browser was available to it): found the app had strong, already-correct

accessibility and state-handling (every list has loading/empty/error

states, ARIA done correctly, focus management on route change, colour

never the sole status signal) but literally no visual design system —

every screen built from the same four ingredients (`bg-white`,

`border-slate-200`, `rounded-md`, 2–3 slate text shades), no brand/accent

colour anywhere, no elevation system, no shared Card/Modal/Toast/Dropdown

primitive (`rounded-md border border-slate-200 bg-white p-4` hand-copied

in 8+ places), inconsistent skeleton coverage, and an analytics dashboard

rendering as flat grey progress bars. Produced a 9-item priority order.



\*\*Implemented\*\* (six commits, `fc38362`..`6c70d8f`, each with its own

`tsc`/`eslint`/targeted-`vitest` pass before moving on):



\- Design tokens in `frontend/src/index.css` via Tailwind v4 `@theme`: a

`--color-brand-\*` scale aliased to Tailwind's indigo (never a hand-picked

palette, so it inherits Tailwind's own tuned contrast/hue steps),

`--shadow-card`/`--shadow-popover`, `--radius-card`.

\- New `frontend/src/components/ui/Card.tsx`: the shared bounded-content

surface, replacing every hand-copied ad hoc card block. Auto-generates

`aria-labelledby` for its own `<h2>` via `useId` when `heading` is passed

(explicit `aria-labelledby` still overrides), and exports

`CARD_SURFACE_CLASSES` for list-row elements that need the identical

visual treatment but must stay a semantic `<li>`, not a nested `<section>`.

Migrated across every feature directory: ticket/asset/article detail

pages, every filter bar, the SLA dashboard, analytics `StatTile`/

`SlaAnalyticsPanel`, and every standalone list row (`HistoryList`,

`TicketTable`/`AssetTable`'s mobile cards, `AssignmentHistoryList`,

`ArticleList`, `ArticleFeedbackLog`). Deliberately NOT applied to the

`AssetLinkPicker`/`ArticleLinkPicker`/`TicketAssetsPanel`/

`TicketKnowledgeArticlesPanel` nested rows, which stayed on a flatter

treatment specifically because they render nested inside an

already-Card-wrapped panel — applying the same shadow/radius there would

have doubled the elevation.

\- `Button.tsx`'s primary variant and a new `PRIMARY_LINK_CLASSES` export

(for the few router `Link`s styled as a primary CTA, which can't render as

a `<button>`) moved from `bg-slate-900` to the brand accent.

\- `AppLayout.tsx`: nav active state now uses the brand accent instead of

slate+underline, the header gained `shadow-card`, and the wordmark gained

a small brand-coloured mark badge (`aria-hidden`, so the link's accessible

name stays exactly "OpsNow").

\- A global sweep moved every `focus-visible:outline-slate-900` (and the

`focus:outline`/`focus:ring`/`focus:border` slate-900 variants) onto the

brand accent, for one consistent interactive-focus colour app-wide.

\- Analytics charts (`BarList`, `ComplianceMeter`, `CategoryAnalyticsPanel`)

moved from flat `bg-slate-700`-on-`bg-slate-100` to the brand accent on a

neutral track with a pill radius. The chosen hex (Tailwind indigo-600,

`#4f46e5`) was run through the \*\*dataviz skill\*\*'s `validate_palette.js`

and passed the lightness/chroma/contrast checks. The "colour never carries

the number, only length + printed text" rule and every `role="meter"`/

`aria-value\*` attribute were left untouched — this is a sequential/

magnitude encoding (one hue throughout), never a categorical or

traffic-light treatment, on the dataviz skill's own rules.

\- `AuditLogTable` — the one table in the app with no responsive treatment

at all — gained `hidden sm:table-cell` on its least-critical column

(Entity) instead of forcing horizontal scroll on narrow viewports.

Deliberately did NOT duplicate rows into a parallel mobile card list the

way `TicketTable`/`AssetTable` do: entity type/id has no natural card-row

shape next to the metadata `<details>` disclosure, and jsdom does not

apply CSS visibility, so a duplicate render would have made several

existing `getByText`/`findByText` assertions in `auditLog.test.tsx`

ambiguous, forcing an unrelated test rewrite. This is a genuine, disclosed

narrowing — entity info is not recoverable via "View details" either, not

a fake fix that only looks solved.

\- New `DetailPageSkeleton` (`components/ui/Spinner.tsx`) replaces

`FullPageSpinner` on the ticket/asset/article detail pages' initial load

with a layout-shaped skeleton (heading bar, badge-row bars, one main card

block, two aside card blocks), carrying the same accessible loading

announcement via a visually hidden `role="status"` region — nothing was

lost for assistive tech.



\*\*Second-pass design review\*\* (`ui-ux-product-designer`, resumed twice

after hitting its turn limit mid-review both times — the first attempt to

continue it mistakenly spawned a fresh, context-less agent instead of

resuming the original via `SendMessage`; that fresh agent correctly

refused to fabricate findings rather than invent a review, and was

discarded): found two real, cheap issues, and flagged one item it could

not resolve within its remaining turns. Folded into commit `f099ec8`:



\- `index.css`'s brand-token comment claimed brand-600 was used for inline

text links; in fact every link (ticket subjects, article titles, "View

details", ...) deliberately stayed `text-slate-900 + underline` — a

considered "quiet link" choice for data-dense tables, common in enterprise

UIs, not an oversight — and only the focus ring carried the brand accent.

Corrected the comment rather than leave it contradicting the code.

\- `Spinner.tsx`'s small inline spinner still used `border-t-slate-900`,

the one spot the earlier focus-ring sweep didn't reach (it targeted

focus/outline classes specifically). Moved to `border-t-brand-700`.

\- Flagged-but-unresolved: whether `HistoryList`/`AssignmentHistoryList`'s

`CARD_SURFACE_CLASSES` rows double up on elevation by sitting inside

another `Card`. Verified directly by tracing both call sites: both

`historyPanel`s are plain `<div>`s and `Tabs`' own tabpanel wrapper carries

no surface styling at all — neither is a `Card`, so there is no nesting

and no double elevation. No code change needed.



\*\*Senior Review\*\* (`senior-reviewer`, two passes — also hit its turn limit

on the first attempt and was correctly resumed via `SendMessage` this

time): no CRITICAL or HIGH finding in any file it reviewed across both

passes, covering `Card.tsx`, `index.css`, the full `f099ec8` diff,

`HistoryList.tsx`/`AssignmentHistoryList.tsx` and their call sites,

`Tabs.tsx`, `AuditLogTable.tsx`, `Spinner.tsx`/`DetailPageSkeleton`,

`AppLayout.tsx` (the largest single diff in the range — nav wiring,

wordmark `aria-hidden` correctness, and header/skip-link stacking all

checked explicitly), the three analytics meter components' `role="meter"`

markup, `Button.tsx`'s `PRIMARY_LINK_CLASSES`, and `TicketDetailPage.tsx`'s

full Card migration (every open tag traced to its matching close). Its

remaining coverage gap (`AssetDetailPage.tsx`/`ArticleDetailPage.tsx`'s

full bodies, `AssetTable.tsx`/`TicketTable.tsx`,

`TicketAiAssistantPanel.tsx`, `ArticleFeedbackWidget.tsx`, the

knowledge-base pages) was closed out directly rather than with a third

agent cycle: a mechanical `<Card` vs `</Card>` open/close count across

every file in `frontend/src` using `Card` found zero mismatches, and all

of those files' own test suites pass unchanged within the full 481-test

run — the class of structural bug a senior review would actually catch in

a mechanical migration like this.



\*\*What was deliberately NOT done\*\*, tracked in `TASKS.md`, not silently

dropped: no toast/notification system (the existing page-local

`InlineNotice` was judged already good); no shared `ResponsiveTable`

primitive extracted; no Modal/Drawer (no concrete need surfaced);

`Badge.tsx`'s tone palette left unchanged (already good, accessible status

colours); `LoginPage.tsx` not touched.



\*\*No visual/rendered verification was possible in this environment\*\*:

there is no browser automation tool available (no Claude in Chrome, no

built-in browser; `WebFetch` explicitly refuses `localhost`). The project

owner was asked directly how to proceed given this constraint and chose

"code-level review only" over pausing the workstream to add browser

tooling, or doing the visual pass themselves. Both the design audit and

the Senior Review are therefore code-level only, disclosed as such

throughout rather than presented as more than they are. A real breakpoint/

visual walkthrough, a keyboard-only pass, a screen-reader spot-check and a

contrast/axe scan of the actual rendered page all remain open — folded

into Phase 17's own "Review accessibility"/"Review responsive design"

items, which stay unchecked for exactly that reason.



Verification: `npx tsc --noEmit` and `npx eslint .` clean at every commit

checkpoint; `npx vitest run` — 39 files, 481 tests passing, matching the

Phase 13 baseline exactly and unchanged throughout the whole workstream.



Git status: six implementation/review-fix commits (`fc38362`, `0222fe4`,

`99e79d1`, `0a27a4d`, `2a47616`, `6c70d8f`) plus the correction-pass commit

(`f099ec8`), all local on `main`, not pushed.



Next:



\- The remainder of Phase 17's checklist: security/performance/

accessibility/responsive review (including the real visual pass this

workstream could not do), dependency and debug-code cleanup, environment-

configuration review, README, architecture/database diagrams, API

documentation, technical-decision documentation, demo data, interview/

demo prep, final GitHub release.



\---



\### 2026-09-22 — Phase 17a-2 Rendered-UI Correction Pass Implemented



Phase 17a (above) closed on a code-only review — no browser tool was

available, so the design and senior reviews could only read source. The

project owner then actually started both dev servers, opened the app in a

real browser at desktop and mobile widths, and paused all further Phase 17

work to report back nine specific, numbered problems: the nav visibly

wrapped/broke below ~900px with no mobile treatment at all; pages felt

narrow with too much dead side margin; tables looked "basic"; forms looked

like "a default form dropped on the page"; the knowledge base was

"generic"; the SLA dashboard was "boxed metrics plus a plain table"; the

audit log looked "like a raw database table"; and analytics, while the

strongest screen, still needed more composition work. This is a materially

different and more useful verdict than a code-only review can reach, and

confirms the earlier pass's own stated limitation was a real gap, not

just a formality.



Workflow: `ui-ux-product-designer` produced a concrete correction spec

from the nine findings (in one pass, no turn-limit issue this time — the

work packet front-loaded enough context) -> implemented across five commits

-> second-pass design review -> one correction commit -> Senior Review ->

full regression. Same `ui-polish` workflow as Phase 17a, this time actually

exercised against a human's real observations instead of a designer's own

code-only inference.



\*\*Implemented\*\* (`87861e9`..`5a08991`, six commits):



\- \*\*App shell rewrite\*\* (`AppLayout.tsx`, full rewrite): the single

biggest structural change. A two-tier header (brand/account strip, then a

nav row) that becomes a fixed slide-in drawer below `md`, toggled by a

hamburger button. The load-bearing design constraint, stated explicitly in

both the work packet and the code's own comments: exactly ONE

`<nav aria-label="Main">` and ONE "Sign out" button must exist in the

rendered tree at all times, never a second copy for mobile — because

several existing tests (`auth.test.tsx`, `AssetListPage.test.tsx`,

`SlaDashboardPage.test.tsx`, `ArticleListPage.test.tsx`) query

`getByRole('navigation', { name: 'Main' })` and

`getByRole('button', { name: /sign out/i })` as singular/unscoped, and

jsdom applies no CSS — so a second, "hidden" mobile copy would actually

coexist in the accessibility tree during a test run and break those

queries, not just add invisible markup. The drawer's CONTAINER is what

changes shape by breakpoint (fixed off-canvas panel vs. static inline

row), never its content. Caught and fixed mid-implementation: an early

draft duplicated the Sign-out button into the drawer for mobile before

this constraint was fully internalised; found and corrected before any

commit. Drawer details: focus moves to the first link on open, Escape

closes and returns focus to the trigger, a backdrop click closes it,

closing also happens automatically on route change, and `invisible` (not

just the off-screen transform) is used when closed so a keyboard user

tabbing past the hamburger doesn't land on off-screen links — restored via

`md:visible` for the desktop row. Active nav state moved from

underline-only to a filled brand-50/brand-700 pill. Page shell widened

`max-w-6xl` -> `max-w-7xl` with scaling gutters (`px-4 sm:px-6 lg:px-8`)

on both the header and `<main>`; header gained `sticky top-0`.



\- \*\*Tables\*\* (`TicketTable`, `AssetTable`, `AuditLogTable`,

`AgentAnalyticsPanel`, `CategoryAnalyticsPanel`, the SLA policy table — six

places): `bg-slate-50` uppercase header band (was the same visual weight

as body text), `divide-y divide-slate-100` row separation (was a border

per row), `hover:bg-slate-50`/`focus-within:bg-slate-50` row highlight

(was none at all), `py-3` row rhythm, whole table wrapped in the `Card`

surface. `focus-within` was deliberately included only on tables whose

rows contain a focusable link (`TicketTable`/`AssetTable`) and omitted from

tables that don't (`AgentAnalyticsPanel`'s rows are plain text) — flagged

by the senior reviewer as possible copy-paste drift, verified by reading

the actual row markup to be a deliberate, correct difference, not a bug.

`AuditLogTable`'s Action cell dropped `<code>` (judged the single biggest

"raw database dump" signal, independent of any styling) for a plain

`font-mono` span; its "View details" disclosure gained a real bordered-chip

affordance with a rotating chevron instead of reading as a bare underlined

link in a data cell. `Pagination` gained a `border-t` footer separator.



\- \*\*SLA dashboard\*\*: the flat, undifferentiated 7-tile metric grid

became a standalone lead figure (Open tickets with an SLA) plus two

labelled subgroups, Response and Resolution. Each non-neutral tile gets a

small shape-coded glyph (check vs. triangle) beside its label — a second,

non-colour cue for breach vs. healthy, the same principle `Badge` already

applies — without touching any calculation, label or value. The glyph

colour was initially amber for every "bad" tile; the design review's

second pass correctly flagged this as inconsistent with `slaDisplay.ts`'s

own established vocabulary (`Breached -> danger`/red,

`AtRisk -> warning`/amber) — every "bad" tile here represents a completed

or in-flight breach, not a merely at-risk state, so it was corrected to

red in a follow-up commit.



\- \*\*Forms\*\* (ticket/asset/article create pages plus their shared form

components): each standalone create page now wraps its form in `Card` —

previously no container at all, reading as "a default form dropped on the

page." The same form components' edit-in-place usage (inside

`TicketDetailPage`/`AssetDetailPage`/`ArticleDetailPage`'s existing Details

Card) was deliberately NOT also wrapped, which would have doubled the

surface — verified structurally impossible to get wrong, not just

avoided by convention: `TicketForm.tsx`/`AssetForm.tsx`/`ArticleForm.tsx`

contain zero `Card` references of their own. Each form gained an internal

section break separating conceptually different field groups, and Cancel

moved from the `secondary` to the `ghost` button variant so Submit reads

as clearly dominant.



\- \*\*Knowledge base\*\*: search now leads `ArticleFilters` on its own

full-width row with an icon and larger type — built as a bespoke `<input>`

with a complete, self-contained class list rather than extending the

shared `Input` component, specifically because this project has no

`tailwind-merge` and appending `pl-9` after `Input`'s hard-coded `px-3` in

one class string is not guaranteed to win Tailwind's cascade. `ArticleList`

article titles are now the dominant element in their card (larger, bolder,

underline dropped as redundant on a card's own heading — a documented,

scoped exception to the project's "links stay quiet" rule, verified by

both review passes to read as a deliberate carve-out rather than an

unexplained inconsistency) with metadata visually demoted behind a

separator. Article body prose gained `max-w-prose`/relaxed leading for

reading comfort at the new page width.



\- \*\*Analytics\*\*: the two remaining raw tables (`AgentAnalyticsPanel`,

`CategoryAnalyticsPanel` — their chart bars had already gotten colour

treatment in Phase 17a) got the same table treatment as above.

`TicketAnalyticsPanel` gained section breaks between its stat grid, its

"Time to resolution" subsection, and its by-status/by-priority charts.



\*\*Second-pass design review\*\* (one pass this time, no resume needed for

the report itself — the earlier turn-limit pattern from Phase 17a repeated

though: the first review agent hit its 10-turn limit mid-review and was

correctly resumed via `SendMessage` rather than re-launched fresh). One

real finding (the SLA glyph colour above), fixed in commit `5a08991`.

Confirmed directly, not assumed: the single-nav/single-Sign-out invariant

holds, no edit-mode form site is double-wrapped in Card, and the

`AuditLogTable` chevron/marker-hiding CSS is valid and correctly wired.



\*\*Senior Review\*\* (also hit its turn limit once, resumed the same way):

\*\*APPROVE, no CRITICAL or HIGH finding.\*\* Verified directly by reading the

actual focus-management effects in `AppLayout.tsx` (not just trusting

that tests pass) that there's no stale-closure risk, no render loop

between the two `useEffect`s, and the drawer's class logic is internally

coherent. A handful of small-diff files (`index.css`, `Pagination.tsx`,

`TicketAnalyticsPanel.tsx`) and two tables' row bodies

(`AssetTable.tsx`/`CategoryAnalyticsPanel.tsx`, checked only by grep during

the review) went unread by the reviewer due to its own turn limit;

closed out afterward with a direct mechanical check (grepped for the

expected treatment markers in every flagged file, and confirmed zero

`Card` references in any of the three form components, closing the one

residual double-wrap risk with certainty rather than inference).



Verification: `npx tsc --noEmit` and `npx eslint .` clean at every commit

checkpoint; `npx vitest run` — 39 files, 481 tests passing, unchanged

throughout the entire correction pass. No backend file touched anywhere

(`git diff --stat` against `backend/` empty across the whole range).



\*\*Still no visual/rendered verification was possible\*\* even for this

pass's own review steps — no browser tool is available in this

environment. The project owner's own manual inspection is what drove this

entire correction pass in the first place, which is precisely why it

happened: a code-only review cannot substitute for someone actually

looking at the rendered result, and this session said so plainly when

asked how to proceed after Phase 17a rather than pretending otherwise.

Both dev servers were left running throughout implementation (backend on

3000, frontend on 5173) — Vite and Nest's watch modes live-reloaded every

change, so nothing needed restarting for the project owner to inspect the

corrected app.



Git status: four implementation commits (`87861e9`, `83a7bb5`, `9e125c4`,

`47b67b5`) plus the correction-pass commit (`5a08991`) — five total, all

local on `main`, not pushed.



Next:



\- Still the remainder of Phase 17's checklist (see the entry above) —

unless the project owner's next round of manual inspection surfaces

further correction work first.



\---



### 2026-09-23 — Phase 17b: Further UI/UX Polish and Demo Data



A third, smaller polish increment on top of Phase 17a/17a-2, run from a

fresh Claude Code session that first read CLAUDE.md, TASKS.md,

progress.md, `.claude/rules/ui-design.md` and the `ui-polish` skill

before touching anything, and confirmed via `git status`/`git log` that

Phases 0–16 and 17a/17a-2 were exactly as documented. The project owner

supplied a fuller 20-area brief as a checklist for this pass.



No browser automation tool was connected in this session either (the

`claude-in-chrome` skill is listed but `ToolSearch` found no

`mcp__claude-in-chrome__*`/`Claude_Browser` tools actually available),

so this remained code-level review, same disclosed limitation as

17a/17a-2.



A concise design review (`ui-ux-product-designer`, explicitly instructed

not to repeat the full audit) read the current code against all 20 brief

areas and found most of it already closed by 17a/17a-2 — the app shell,

the page-header pattern (`PageHeading`, already consistent), content

width, all six tables, forms, ticket detail's main+aside layout, KB,

audit log and the shared feedback pattern needed no further work. It

returned 5 concrete remaining gaps plus a data-shape recommendation:



1\. `SlaDashboardPage.tsx` had two un-migrated raw `rounded-md border`

surfaces (the metric tiles and the lead figure) and a plain-text policy

Status column instead of a `Badge` — leftover from before the `Card`

primitive existed.

2\. The Analytics dashboard had no "what needs attention" signal at all,

undercutting its role as the strongest portfolio screen.

3\. `LoginPage.tsx` — TASKS.md already flagged this as untouched by 17a —

was still a generic centered form with no brand treatment.

4\. The AI assistant panel was structurally indistinguishable from the

ticket-detail cards around it.

5\. Seed data (5 tickets/5 assets/3 KB articles) was sparse enough that

even a well-composed dashboard would look empty.



Implemented directly (no `fullstack-engineer` needed for the frontend

items; the seed-data expansion was delegated to `fullstack-engineer` as

a large, mostly-mechanical, isolated workstream, per the ui-polish

skill's step C):



\- SLA dashboard: the two raw surfaces now use `CARD_SURFACE_CLASSES`/

`rounded-card`+`shadow-card`; the policy Status column now renders a

`Badge` (success/neutral).

\- Analytics: `StatTile` gained an `emphasis?: boolean` prop — a red

left-accent border plus a `Badge tone="danger"` "Needs attention" label

(never colour alone), wired only to the SLA panel's in-flight-breach

tile (`clock.inFlightBreached > 0`), not applied broadly.

\- `LoginPage.tsx`: a brand wordmark badge, the form wrapped in `Card`,

the page background raised to `bg-slate-50` so the white Card reads as

a surface.

\- `TicketAiAssistantPanel.tsx`: a small `aria-hidden` inline-SVG sparkle

icon beside the "AI assistant" heading. A `border-brand-200` alternative

was considered and deliberately rejected: `Card.tsx` appends a passed

`className` after its own hardcoded `border-slate-200` in one template

string, this codebase has no tailwind-merge to resolve that

deterministically, and there is no existing precedent overriding a

`Card`'s border color this way — with no browser available to verify

the actual cascade outcome, the icon-only, structurally unambiguous fix

was judged safer.

\- `backend/prisma/seed.ts`: expanded from 5→53 tickets, 5→20 assets,

3→11 KB articles, deterministically (index-derived variation throughout,

no `Math.random()` anywhere). The 5 original hand-crafted narrative

tickets are kept byte-for-byte — they demonstrate specific documented

behaviors (the reopen-without-a-new-SLA-cycle case, a paused-past-due

clock) that would have been a real regression to lose. 48 generated

tickets add a real spread across all 6 statuses, 4 priorities, 8

categories and ~60 days of creation time; 10 of them carry an in-flight

SLA breach specifically so the new Analytics "Needs attention" tile is

non-zero in fresh seed data, not just decorative volume. Assets span all

6 types and all 5 statuses with a consistent `AssetAssignment` ledger

(one open row per assigned asset, `returnedAt` set for the rest). KB

articles mix Draft/Published/Archived across 4 categories (2 new). The 7

seeded accounts (email/password) are unchanged — every e2e suite still

logs in as the same fixed users. Before touching this, confirmed no

backend or frontend e2e test hardcodes an exact seed row count or a

specific generated-ticket subject; the one real constraint found (the

`ticket-categories` e2e suite asserting "Hardware" and its child

"Laptop" exist) was preserved.



The seed-data subagent needed two mid-task resumes to finish (it hit its

own turn limit twice while writing the ~425-line generator and again

while running verification) — both resumed correctly via `SendMessage`

to the same agent id after the first resume attempt was mistakenly sent

as a **new** `Agent` call instead (caught immediately via `ListAgents`,

the accidental duplicate stopped before it did any work, no lost or

conflicting work resulted). The agent did its implementation and

verification work inside its own git worktree; since it never committed

there, the finished file was copied from the worktree's working tree

into the main checkout by hand rather than merged via git history, then

independently re-verified from the main checkout rather than trusted

as-is.



Independent review (Mandatory Gate #2 — separate `ui-ux-product-designer`

second-pass and `senior-reviewer` passes, neither reused from

implementation without being asked to independently re-check):



\- \*\*Design review\*\*: confirmed all 5 items match spec with no new issue

introduced, explicitly agreed the `border-brand-200` rejection was the

right call for the reason given, and flagged one near-miss it ruled out

after checking (`StatTile`'s `<dt>` gained `flex flex-wrap items-center

gap-1.5` unconditionally, not just under `emphasis` — confirmed visually

inert for the non-emphasis case, not a regression). No correction pass

needed.

\- \*\*Senior Review\*\* (STANDARD tier, agreed — no auth/RBAC/business-logic

file touched by either commit, confirmed via `git diff --stat` against

`backend/src/` and against `frontend/` respectively, both empty): \*\*no

CRITICAL, HIGH or MEDIUM findings.\*\* 5 LOW notes: four are direct

confirmations that a specific risk does NOT exist (emphasis scoping,

the Badge swap's test compatibility, `LoginPage`'s accessibility

regions, the AI panel's accessible name via `aria-hidden`) rather than

defects; the fifth documents a latent, non-live fragility — `seed.ts`'s

synthetic `resolvedAt` for a resolved/closed ticket has no explicit

upper-bound clamp to "now", and while every current generation path was

traced and confirmed not to trigger it, a future edit to the template

array (reordering, inserting a template, changing a priority) could

silently reintroduce a future-dated `resolvedAt`. Recorded as a tracked,

deliberately-deferred TASKS.md item (a `Math.min(resolvedAt, new

Date())`-style clamp) rather than fixed now, since it is not a live bug

and the reviewer explicitly did not treat it as blocking.



Verification: frontend `npx tsc --noEmit`, `npx eslint .`,

`npx vitest run` (481/481 across all 39 files, unchanged from the

Phase 17a-2 baseline), `npx vite build`, all clean. Backend

`npx prisma validate`, `npx tsc --noEmit`, `npm test` (864/864,

unchanged), `npm run test:e2e` (350/350, unchanged) — run fresh from the

main checkout against the actually-reseeded local `opsnow_dev`, not just

trusted from the subagent's report. Final row counts (53 tickets/20

assets/11 KB articles/10 in-flight-breached) were independently

spot-checked with a direct Prisma query against the live database before

committing, rather than taken on the subagent's word.



Git status: two commits, both local on `main`, not pushed — `46cb254`

(the five frontend fixes) and `f2d2b83` (the seed-data expansion). The

seed-data agent's now-merged scratch worktree and branch

(`worktree-agent-ae403f7ec2a975556`) were removed after the merge was

confirmed.



\*\*Still no visual/rendered verification was possible\*\* — no browser

automation tool was actually connected in this session, despite the

`ui-polish`/`claude-in-chrome` skills being listed. Folded into Phase

17's existing "Review accessibility"/"Review responsive design" items,

which remain unchecked, same as every prior UI-polish pass.



Next:



\- The remainder of Phase 17's checklist (security/performance/

accessibility/responsive review, dependency and debug-code cleanup,

README, diagrams, API docs, technical-decision documentation,

interview/demo prep, final GitHub release) — demo data is now largely

addressed, narrowing what's left in that item to future maintenance

rather than a from-scratch task.



\---



### 2026-09-23 — Phase 17c: Final Review, Documentation, Verification and Release Preparation

An autonomous final-completion run covering the rest of Phase 17. Recovery first: `git status` (17 local commits ahead of `origin/main`, nothing pushed yet), current branch, recent log, `git worktree list` (only `main`, no stale worktrees), no stray local branches — confirmed before anything was changed. Phases 0–16 and Phase 17a/17a-2/17b were treated as done per their own entries above; no completed phase was reopened and no re-architecture was attempted.

Completed:

\- Security/performance/dependency/environment review (code-level, no new findings): rate limiting (ADR-026), default-deny routing (ADR-018), RBAC (ADR-006), Swagger's environment-gated default (ADR-027) and production env validation (`env.validation.ts`) all confirmed still exactly as documented. Hot paths (ticket/asset/audit-log list queries, analytics raw-SQL aggregates, KB `tsvector` search) confirmed covered by existing indexes/design, no speculative optimization attempted. Both `package.json` dependency lists inspected line by line — nothing unused, nothing removed. `backend/src` and `frontend/src` swept for `console.log`/`TODO`/`FIXME`/`XXX` — the only `console.log` usage is the intentional `create-admin` CLI; nothing else found, nothing removed. `.env.example`, `.env.docker.example`, `docker-compose.yml`'s env blocks and `docs/deployment.md` re-read against current code — no drift, no real secret anywhere in the tree.

\- Accessibility/responsive design: re-confirmed no browser automation tool is available in this environment (checked directly via tool search, not assumed from the earlier phase notes) — still only a network `WebFetch` that refuses `localhost`. No rendered verification was possible, so both items remain honestly unchecked in TASKS.md rather than marked complete on a code-level pass alone. No UI code was touched in this pass.

\- New documentation: `docs/architecture/system-architecture.md` (Mermaid component diagram, request pipeline, refresh-token sequence diagram, the AI provider boundary), `docs/architecture/database-erd.md` (two Mermaid ER diagrams built directly from `schema.prisma`, plus the CHECK-constraint/partial-index/generated-column notes ERD notation can't express), `docs/api/README.md` (conventions companion to Swagger — auth model, RBAC table, error envelope, 404-vs-403, concurrency/409, pagination, AI endpoint configuration — built from the actual controller route map), `docs/decisions-summary.md` (one-paragraph-per-decision index into all 27 ADRs, no new ADR written), `docs/portfolio/interview-prep.md` and `docs/portfolio/demo-walkthrough.md` (using the existing, already-local-only seeded `@opsnow.local`/`DevPassword123!` accounts).

\- `README.md` updated: reverified test counts (864/44 backend unit, 350/12 backend e2e, 481/39 frontend, 11 Playwright — all from a real run in this session, not copied forward), a Documentation Map table, and Phase 17 status language corrected to distinguish "done" from "externally blocked."

\- Full verification gate, all green: backend `prisma validate`, `prisma migrate status` (up to date), `tsc --noEmit`, `eslint . --max-warnings 0`, `npm test` (864/864), `npm run test:e2e` (350/350, real local `opsnow_dev`), `npm run build`, `npm audit` (0 vulnerabilities, full tree and the CI `--omit=dev --audit-level=high` gate). Frontend `tsc --noEmit`, `eslint .`, `vitest run` (481/481), `vite build`, `npm audit` (0 vulnerabilities), `npx playwright test` (11/11 — backend started locally with `AUTH_THROTTLE_LIMIT` raised per the README caveat, teardown removed its own tagged data, background process stopped afterward). Docker/`actionlint`/`nginx` confirmed still unavailable on this machine; `docker-compose.yml`, `.github/workflows/ci.yml`, both Dockerfiles and `frontend/nginx.conf` were instead read in full and cross-checked against each other (CI's `docker` job targets match the Dockerfiles' actual build stages; the Compose service graph and health-check/`depends_on` chain re-inspected; nginx's load-bearing invariants re-read against their own header comments) rather than executed.

\- Repository cleanup: `git worktree prune` (nothing to prune), no local branches besides `main`, `.gitignore` re-verified to cover secrets/`node_modules`/build output/Playwright's `test-results/`. Nothing found to remove.

\- Independent review: a Senior Reviewer agent checked the entire documentation-only diff against the real codebase rather than reviewing prose in isolation — the database ERD against `schema.prisma` field-by-field, the API RBAC table against the actual `@Roles()` decorators in `users.controller.ts`/`audit.controller.ts`/`analytics.controller.ts`, six spot-checked ADR summaries against `DECISIONS.md`, the request-pipeline order against `configure-app.ts`/`auth.module.ts`, and the demo walkthrough's seeded credentials against `seed.ts` field-by-field (including reconciling the "10 breaching tickets" figure against the seed's own generation logic). No CRITICAL/HIGH/MEDIUM/LOW finding. Verdict: approve.

\- Release preparation: no prior git tags existed; both `package.json` files declare `0.1.0`, so `v0.1.0` was chosen as the tag rather than inventing a different scheme. `docs/releases/v0.1.0.md` written as the release notes (highlights, what's not included, a pointer to the documentation set). No `gh` CLI and no GitHub API token are available in this environment, so the formal GitHub Release object could not be created automatically — see this entry's Git/CI/Release outcome below for exactly what was done instead and what remains a manual step.

No backend or frontend source file was touched in this pass — `git diff --stat` against `backend/` and `frontend/` for the whole of Phase 17c is empty; every change is documentation, `TASKS.md`/`progress.md`/`CLAUDE.md`/`README.md` status text, and the new `docs/` tree.

\---



## Resume Instructions



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

