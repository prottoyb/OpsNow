\# OpsNow Development Progress



\## Current Status



Project status: In Progress



Current phase: Phase 4 — Authentication



Current task: Create user model



Last completed task: Phase 3 — Backend Foundation (NestJS application initialized, configured, tested and verified)



Next task: Create user model



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

