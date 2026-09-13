\# OpsNow Development Progress



\## Current Status



Project status: In Progress



Current phase: Phase 3 — Backend Foundation



Current task: Initialize NestJS application



Last completed task: Phase 2 — Database (implemented, migrated, seeded and verified)



Next task: Initialize NestJS application



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

