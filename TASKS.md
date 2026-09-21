\# OpsNow Development Tasks



\## Project Status



Status: In Progress



Current Phase: Phase 13 — Testing & Quality (not started). Phase 12 — AI Ticket Assistant (backend API and frontend UI) — complete; Phase 11 — Audit Logging (backend and UI) — complete; Phase 10 — Dashboard & Analytics (backend API and frontend UI) — complete; Phase 9 — Knowledge Base (backend API and frontend UI) — complete; Phases 8a and 8b — Asset Management backend API and frontend UI — complete; Phases 7a and 7b — SLA Management backend API and frontend UI — complete; Phases 6a and 6b — Ticket Management backend API and frontend UI — complete.



\---



\# Phase 0 — Project Foundation



\- \[x] Create OpsNow project directory

\- \[x] Initialize Git repository

\- \[x] Create initial project directory structure

\- \[x] Create CLAUDE.md

\- \[x] Create TASKS.md

\- \[x] Create progress.md

\- \[x] Create DECISIONS.md

\- \[x] Create README.md

\- \[x] Create initial Git checkpoint



\---



\# Phase 1 — Architecture \& Technical Foundation



\- \[x] Define application architecture

\- \[x] Define frontend architecture

\- \[x] Define backend architecture

\- \[x] Define database architecture

\- \[x] Define authentication strategy

\- \[x] Define authorization/RBAC strategy

\- \[x] Define API conventions

\- \[x] Define error-handling strategy

\- \[x] Define testing strategy

\- \[x] Document architecture decisions

\- \[x] Review architecture before implementation



\---



\# Phase 2 — Database



\- \[x] Configure PostgreSQL

\- \[x] Configure database migrations

\- \[x] Design users and roles schema

\- \[x] Design tickets schema

\- \[x] Design ticket comments schema

\- \[x] Design ticket history schema

\- \[x] Design SLA schema

\- \[x] Design assets schema

\- \[x] Design knowledge base schema

\- \[x] Design notifications schema

\- \[x] Design audit log schema

\- \[x] Create database migrations

\- \[x] Create seed data

\- \[x] Test database structure



\---



\# Phase 3 — Backend Foundation



\- \[x] Initialize NestJS application

\- \[x] Configure TypeScript

\- \[x] Configure environment variables

\- \[x] Configure PostgreSQL connection

\- \[x] Configure application logging

\- \[x] Configure global validation

\- \[x] Configure error handling

\- \[x] Configure API documentation

\- \[x] Create initial health-check endpoint

\- \[x] Add backend tests

\- \[x] Verify backend build



\---



\# Phase 4 — Authentication



\- \[x] Create user model

\- \[x] Create registration flow

\- \[x] Create login flow

\- \[x] Implement password hashing

\- \[x] Implement access tokens

\- \[x] Implement refresh tokens

\- \[x] Implement logout

\- \[x] Handle expired tokens

\- \[x] Protect backend routes

\- \[x] Add authentication tests

\- \[x] Test authentication workflow

\- \[ ] (Deferred) Rate-limit /auth/login and /auth/register — no

brute-force/credential-stuffing protection exists yet; flagged by

Phase 4's architect review as a real exposure for sensitive auth

endpoints. See progress.md's Phase 4 entry for the full rationale.



\---



\# Phase 5 — Authorization \& RBAC



\- \[x] Create roles

\- \[x] Create permissions

\- \[x] Implement role-based authorization

\- \[x] Implement backend authorization guards

\- \[x] Create employee permissions

\- \[x] Create support-agent permissions

\- \[x] Create team-lead permissions

\- \[x] Create administrator permissions

\- \[x] Add authorization tests

\- \[x] Verify unauthorized API access is blocked



Note: per ADR-006, roles are a fixed enum, not a dynamic permissions table —

"create X permissions" above is satisfied by the \`@Roles()\`/\`RolesGuard\`

mechanism being enforced and tested per role (see the Administrator-only

\`GET /api/v1/users\` endpoint and its e2e tests), not by a standalone

permissions artifact. Concrete per-role permission sets for real business

resources (tickets, assets, knowledge base, etc.) are defined per-endpoint

starting in Phase 6, using this same mechanism.



\---



\# Phase 6a — Ticket Management (Backend API)



\- \[x] Create ticket entity

\- \[x] Create ticket repository

\- \[x] Create ticket service

\- \[x] Create ticket controller

\- \[x] Add ticket validation

\- \[x] Create ticket creation API

\- \[x] Create ticket retrieval API

\- \[x] Create ticket update API

\- \[x] Implement ticket assignment

\- \[x] Implement ticket status management

\- \[x] Implement ticket priority management

\- \[x] Implement ticket categories

\- \[x] Implement ticket comments

\- \[x] Implement internal notes

\- \[x] Implement ticket history

\- \[x] Add ticket backend tests

\- \[x] Test complete ticket workflow (backend API e2e slice — see Phase 6b

for the UI workflow test)



Note: no separate repository/entity layer was added — consistent with

Phases 3–5's established pattern, `UsersService`/`TicketsService` talk to

`PrismaService` directly and the Prisma model \*is\* the entity (this isn't

TypeORM). "Create ticket entity"/"Create ticket repository" are satisfied

by the existing Phase 2 Prisma schema and the same direct-Prisma-access

pattern, not a new abstraction layer.



Note: "Implement ticket categories" means ticket creation/update validates

against, and a `GET /api/v1/ticket-categories` endpoint exposes, the

existing Phase 2 seeded category tree — there is no category CRUD API.

Categories remain admin-managed seed data; management endpoints are not

part of Phase 6a and are not currently planned for any specific future

phase.



\---



\# Phase 6b — Ticket Management (Frontend UI)



Split out from the original Phase 6 (see ADR-019's context and

progress.md's Phase 6a entry): no frontend has been scaffolded anywhere in

the repo yet (Phases 0–5 were entirely backend), so bootstrapping an

entire Vite/React/Tailwind application (ADR-002/016) belongs in its own

reviewed effort rather than bundled into the backend ticket-API work.



\- \[x] Scaffold the frontend application (Vite/React/TypeScript/Tailwind

per ADR-002/016 — not yet done anywhere in the repo)

\- \[x] Build ticket list page

\- \[x] Build ticket creation page

\- \[x] Build ticket detail page

\- \[x] Connect frontend to backend

\- \[x] Test complete ticket workflow (UI workflow test)

Note: a login page was also built, as a necessary enabler rather than extra

scope — ADR-018 makes every ticket route default-deny, so no ticket page is

reachable without authenticating. Registration, password reset and

account-management UI are deliberately NOT included; `POST /auth/register`

exists on the backend and can be surfaced whenever a phase calls for it.

Note: assignment is limited to "Assign to me" and "Unassign", and the list's

assignee filter is two-state (Anyone / Assigned to me). Neither is a design

preference — `GET /api/v1/users` is Administrator-only, has no role filter

and returns no `isActive` flag, so no staff directory can be built, and

`ListTicketsQueryDto.assigneeId` is a plain UUID, so "unassigned" is not

expressible. See the deferred items below.

Note: a ticket's category can be changed but not cleared, because

`UpdateTicketDto.categoryId` has no null allowance and the global

ValidationPipe runs `forbidNonWhitelisted`, so `categoryId: null` is a 400.

The UI therefore never offers a "no category" option once one is set.

\---

\## Deferred from Phase 6b (tracked, not dropped)

\- \[ ] Staff-visible user listing so Support Agents and Team Leads can

assign a ticket to someone other than themselves. Would be a new endpoint

returning `UserSummary` (never `SafeUser`, which exposes email) with role

and `isActive` filters. Deliberately deferred by the project owner rather

than changing the Phase 6a contract mid-phase.

\- \[ ] Allow a ticket's category to be cleared (`UpdateTicketDto.categoryId`

accepting null via `@ValidateIf`, as `AssignTicketDto.assigneeId` already

does).

\- \[ ] `GET /api/v1/tickets` answers 500, not 400, for an absurd but

integer-typed `offset` (e.g. `offset=99999999999999999999`). A Phase 6a

validation gap found during Phase 6b review; the frontend clamps the value

so it cannot originate one, but the backend should reject it cleanly.



\---



\# Phase 7a — SLA Management (Backend API)



\- \[x] Create SLA policies

\- \[x] Define priority-based SLA rules

\- \[x] Implement response SLA calculation

\- \[x] Implement resolution SLA calculation

\- \[x] Implement SLA countdown

\- \[x] Implement SLA breach detection

\- \[x] Implement SLA at-risk status

\- \[x] Add SLA information to tickets

\- \[x] Build SLA dashboard metrics

\- \[x] Add SLA tests



See DECISIONS.md ADR-020 for the full design (policy snapshotting,

pause/resume due-date shifting, first-response qualification, the

reopen pause-credit mechanism, priority-change deltas, and the

concurrency invariants). `SlaPolicy`/`TicketSla` were already part of

the Phase 2 schema/migration — Phase 7a adds no new migration.



Split into 7a (backend) / 7b (frontend) following the Phase 6a/6b

precedent, since a backend-complete, frontend-not-started SLA feature

is a real, independently verifiable milestone.



\---



\# Phase 7b — SLA Management (Frontend UI)



\- \[x] Show each ticket's SLA state (response/resolution due, remaining

time, breach/at-risk/paused) on the ticket detail page

\- \[x] Surface SLA state (e.g. an at-risk/breached indicator) in the

ticket list

\- \[x] Build a staff-only SLA dashboard view consuming

`GET /api/v1/sla/metrics` and `GET /api/v1/sla-policies`

\- \[x] Add frontend tests for the above



See DECISIONS.md ADR-021 for the frontend rendering model (backend SLA

state strings are authoritative and never re-derived client-side; the

countdown ages the backend’s own `minutesRemaining` from a locally

captured receipt instant; paused and finished clocks do not tick; one

shared visibility-aware timer drives every countdown; nothing refetches

when a countdown reaches zero).



No backend file was changed — Phase 7b consumes the Phase 7a contract

as-is, and adds no new endpoint. No new dependency was added.



\## Deferred from Phase 7b (tracked, not dropped)



\- \[ ] SLA countdown staleness in a long-lived background tab.

`lib/api/queryClient.ts` sets `refetchOnWindowFocus: false` for every

query in the project, so a tab left open is not refreshed on return and

its SLA countdown can read "Due now" beside a badge that still says "on

track" until something remounts the query (see ADR-021's Consequences).

Options are enabling focus refetching for ticket queries specifically, or

a visibility-driven invalidate. Deferred for the project owner's decision

because either one changes shared query configuration affecting every

ticket query, beyond Phase 7b's approved scope — not because it was

overlooked.



\- \[ ] Bind the at-risk threshold wording to the backend constant. The

frontend's at-risk copy (`slaDisplay.ts`, `SlaDashboardPage.tsx`) is now

worded so it stays true whatever `AT_RISK_FRACTION` is set to, but

nothing mechanically ties the two together; a shared constant or a

generated value would.



\- \[ ] Add a repository-wide guard test in `frontend/src/test/guards.test.ts`

forbidding a string argument to `setTimeout`/`setInterval`. The file

already forbids `eval` and `new Function`; the string-timer form is the

remaining member of that family. Hygiene, no known defect.



\---



\# Phase 8a — Asset Management (Backend API)



\- \[x] Create asset types

\- \[x] Create asset entity

\- \[x] Create asset service

\- \[x] Create asset API

\- \[x] Implement asset assignment

\- \[x] Implement asset history

\- \[x] Link assets to tickets

\- \[x] Add asset tests (backend unit + e2e; frontend tests land in 8b)



`Asset`, `AssetType`, `AssetAssignment` and `TicketAsset` were already

part of the Phase 2 schema/migration — Phase 8a adds no new migration,

and no new ADR: it reuses ADR-019's per-row visibility pattern (via

`common/asset-visibility.ts`, a sibling of `common/ticket-visibility.ts`)

and the same read-then-conditional-update concurrency pattern as ticket

assignment, rather than introducing a policy engine or an audit table.

The `AssetAssignment` ledger IS the asset history; there is no separate

history model.



Split into 8a (backend) / 8b (frontend) following the Phase 6a/6b and

7a/7b precedent.



\---



\# Phase 8b — Asset Management (Frontend UI)



\- \[x] Build asset list page

\- \[x] Build asset detail page

\- \[x] Build asset assignment interface

\- \[x] Show a ticket's linked assets

\- \[x] Add asset frontend tests



Note for 8b: `PATCH /api/v1/assets/:id` rejects any request that carries

`status` while the asset is assigned, and rejects `status: "Assigned"`

outright — so an edit form must OMIT `status` unless it is actually

changing it. `GET /api/v1/tickets/:id/assets` deliberately returns a

narrow asset summary (id, assetTag, name, status, assetType) for every

role; full detail comes from the row-scoped `GET /api/v1/assets/:id`.



Both are handled: the edit form has no `status` field at all (status is a

separate staff-only control) and sends a minimal diff, and ticket-linked

assets render only the narrow summary. Deferred out of 8b by decision: no

asset deletion/decommission UI, no AssetType CRUD, no arbitrary-user

assignment picker — `GET /api/v1/users` is Administrator-only, so the

only assignment targets offered are "Assign to me", "Assign to requester"

and "Return to stock".



\---



\# Phase 9 — Knowledge Base



Split into 9a (backend API) / 9b (frontend UI) following the Phase 6a/6b,
7a/7b and 8a/8b precedent. Both halves are complete.

\## Phase 9a — Knowledge Base (Backend API)

\- \[x] Create knowledge article entity

\- \[x] Create knowledge categories

\- \[x] Create article API

\- \[x] Implement article search

\- \[x] Implement article filtering

\- \[x] Implement article feedback

\- \[x] Link knowledge articles to tickets

\- \[x] Add knowledge base backend tests (unit + e2e)

\## Phase 9b — Knowledge Base (Frontend UI)

\- \[x] Build article list

\- \[x] Build article detail page

\- \[x] Add knowledge base frontend tests

`KnowledgeBaseCategory`, `KnowledgeBaseArticle`,
`KnowledgeBaseArticleFeedback` and `TicketKnowledgeArticle` were already
part of the Phase 2 schema/migration — Phase 9 adds no new migration.
See DECISIONS.md ADR-022 for the access-control, authoring/editorial,
search and feedback model.

Note: as in Phases 6a/8a, there is no separate entity/repository layer —
the Prisma model is the entity and the service talks to `PrismaService`
directly. "Create knowledge categories" means the seeded category tree is
exposed read-only via `GET /api/v1/kb-categories`; there is no category
CRUD API, matching `ticket-categories` and `asset-types`.

\## Deferred from Phase 9 (tracked, not dropped)

\- \[ ] No article DELETE endpoint — `status: Archived` is the retire path,
and `deletedAt` exists in the schema but is never written by the API.
A soft-delete route would need its own role rules.

\- \[ ] No knowledge-base category CRUD UI or API; categories stay seed
data, like ticket categories and asset types.

\- \[ ] Article search ranking is PostgreSQL `ts_rank` over the generated
`search_vector` only; there is no synonym dictionary, fuzzy matching or
"did you mean" handling.



\---



\# Phase 10 — Dashboard \& Analytics



Split into 10a (backend API) / 10b (frontend UI) following the Phase 6a/6b,

7a/7b, 8a/8b and 9a/9b precedent. Both halves are complete.

\## Phase 10a — Dashboard \& Analytics (Backend API)

\- \[x] Create dashboard API

\- \[x] Calculate ticket metrics

\- \[x] Calculate SLA metrics

\- \[x] Calculate resolution metrics

\- \[x] Calculate category statistics

\- \[x] Calculate agent performance

\## Phase 10b — Dashboard \& Analytics (Frontend UI)

\- \[x] Build management dashboard

\- \[x] Build ticket analytics

\- \[x] Build SLA analytics

\- \[x] Add dashboard filtering

\- \[x] Add analytics tests (backend unit + e2e, frontend vitest)

See DECISIONS.md ADR-024 for the cohort definitions, the raw-SQL

visibility twin, the pause-aware at-risk aggregate and the null-versus-zero

reporting rule. No migration, no new model and no new dependency — the

figures are computed on demand from the live tables, with no materialized

view, summary table, cache or scheduled job (ADR-017, and ADR-020's

Decision 8 which already rejected a poller on the same grounds).

Note: `GET /api/v1/analytics/agents` is gated to TeamLead and Administrator

only — narrower than the `STAFF_ROLES` gate on the other three routes —

because it names individual members of staff and ranks them against one

another, which is line-management information rather than operational

information.

\## Deferred from Phase 10 (tracked, not dropped)

\- \[ ] Resolution time is wall-clock from creation to resolution and does

NOT subtract time the ticket spent paused (OnHold). A ticket parked

awaiting a user reply therefore reports a longer resolution time than the

work actually took. Subtracting pause credit would need the same

pause-ledger arithmetic ADR-020 applies to SLA due dates, which is a

larger change than Phase 10's scope.

\- \[ ] Agent SLA compliance is based on the resolution clock only; the

response clock does not contribute to an agent's compliance figure.

\- \[ ] No assignee picker on the dashboard filter bar — the filter offers

only "Assigned to me", because `GET /api/v1/users` is Administrator-only

and no staff directory endpoint exists. This is the same limitation

already deferred from Phases 6b and 8b and would be resolved by the same

endpoint.

\- \[ ] No time-series/trend charts, no drill-down from a dashboard figure

to the underlying ticket list, and no date presets ("last 7 days"). The

visuals are dependency-free stat tiles, bar rows and a compliance meter;

a charting library was deliberately not added (ADR-017).

\- \[ ] The analytics e2e at-risk test asserts on aggregate deltas against

the shared development database. It would flap only if a pre-existing

ticket crossed the at-risk threshold during the few hundred milliseconds

of the test's run — unlikely, but it is a real shared-state dependency

rather than a hermetic assertion.



\---



\# Phase 11 — Audit Logging



\- \[x] Create audit log entity

\- \[x] Implement audit event service

\- \[x] Record authentication events

\- \[x] Record ticket changes

\- \[x] Record assignment changes

\- \[x] Record permission-sensitive actions

\- \[x] Build audit log interface

\- \[x] Add audit log filtering

\- \[x] Test audit logging

`AuditLog` was already part of the Phase 2 schema/migration — Phase 11 adds

no new migration. As in Phases 6a/8a/9a there is no separate

entity/repository layer: the Prisma model is the entity, so "Create audit

log entity" is satisfied by the existing model plus the typed event

builders in `audit.events.ts`.

See DECISIONS.md ADR-025 for the redaction model, the write semantics and

the reasoning behind the read gate.

Note: `GET /api/v1/audit-logs` is **Administrator-only**, deliberately

narrower than the staff-only gate used elsewhere — the log records every

user's actions including authentication events, so a TeamLead has no

operational need for it. The log is append-only: there is no update or

delete route, and an e2e test asserts their absence.

Note: the frontend cannot import backend code, so the closed action list

is mirrored in `frontend/src/types/api.ts`. A drift guard test,

`frontend/src/features/audit/auditActions.test.ts`, reads

`backend/src/audit/audit.constants.ts` and fails if the two diverge.

\## Deferred from Phase 11 (tracked, not dropped)

\- \[ ] Existing e2e suites (tickets, assets, auth) now generate audit rows

as a by-product of logging in and acting, and do not clean them up, so the

`audit_logs` table grows in a developer's database. The audit suite cleans

up after itself. Options are a per-suite `afterAll` that removes each

run's own audit rows, or accepting growth as correct for an append-only

table. Left for the project owner to decide — pruning an audit table is a

deliberate human decision, not something a test run should do on its own.

\- \[ ] An audit event can be lost silently if the insert fails, or if the

process dies between the primary commit and the audit write (writes are

best-effort after commit, never enrolled in the operation's transaction —

see ADR-025). An outbox pattern would close the second gap.

\- \[ ] Rejected operations are not recorded: a 400 or 409 writes no audit

row, and unauthenticated 401s are not recorded.

\- \[ ] Ticket comment events, knowledge-article link events and

asset-to-ticket link/unlink events are not instrumented. `ticket_history`

remains the authority for a ticket's full change history.

\- \[ ] IP and user-agent are null on ticket and asset events, because

those services receive only the user and not the request. Also, `req.ip`

is the proxy's address behind a reverse proxy, because `trust proxy` is

not configured — a pre-existing property, but one that matters more now

that the value is persisted into an audit row.

\- \[ ] The `outcome` filter is unindexed: `outcome` lives inside

`metadata` and is filtered by JSON-path equality, which is what avoided a

migration.

\- \[ ] No actor picker on the audit filter bar — a validated UUID box

instead, because `GET /api/v1/users` is Administrator-only and no staff

directory endpoint exists. Same root cause as the deferred items in

Phases 6b, 8b and 10.

\- \[ ] Audit rows do not link through to the ticket or asset they

reference, and there is no export or live refresh.



\---



\# Phase 12 — AI Ticket Assistant



Split into 12a (backend API) / 12b (frontend UI) following the Phase 6a/6b,
7a/7b, 8a/8b, 9a/9b and 10a/10b precedent. Both halves are complete.

\## Phase 12a — AI Ticket Assistant (Backend API)

\- \[x] Define AI use cases

\- \[x] Design AI service architecture

\- \[x] Implement secure AI API integration

\- \[x] Implement ticket analysis

\- \[x] Implement category suggestion

\- \[x] Implement priority suggestion

\- \[x] Implement knowledge article suggestions

\- \[x] Implement response draft generation

\- \[x] Implement resolution summary generation

\- \[x] Handle AI failures safely

\- \[x] Add AI feature tests (backend unit + e2e)

\## Phase 12b — AI Ticket Assistant (Frontend UI)

\- \[x] Build the staff AI assistant panel on the ticket detail page
(triage, draft response, resolution summary)

\- \[x] Handle the disabled, unavailable and 503 states safely

\- \[x] Add AI frontend tests (vitest)

See DECISIONS.md ADR-023 for the provider boundary, the grounding model
and the failure model. No migration, no new npm dependency on either side,
and no new endpoint for 12b — the UI consumes the 12a contract as-is.

Note: ADR-023's Decision 12 originally recorded Phase 12 as backend-only,
because the Phase 12 task list above named no frontend items. The project
owner subsequently asked for the UI, so that decision is amended in
DECISIONS.md rather than left contradicting the built state, and the task
list is split into 12a/12b to match every other phase since Phase 6.

Note: the assistant is OFF in a default install. With no `AI_PROVIDER` and
no `AI_API_KEY`, `GET /ai/status` answers `enabled: false` and the panel
renders a short "not available on this server" note with no buttons —
which is the intended out-of-the-box experience, not a failure. Set
`AI_PROVIDER=mock` to demonstrate the success path without a vendor key;
the UI labels mock output as canned sample text.

Note: nothing in the UI can change a ticket. A suggestion is applied only
by a second explicit click, which calls the ordinary `PATCH /tickets/:id`
(or `/priority`) through the ticket page's existing mutations, so an
accepted suggestion gets the same validation, history write and 403/409
recovery as a change someone typed.

\## Deferred from Phase 12 (tracked, not dropped)

\- \[ ] No "copy draft" button. The generated reply renders in a read-only
textarea the agent selects and copies by hand. A clipboard button needs
`navigator.clipboard` feature detection and a fallback (it is absent under
jsdom), which was judged not worth the surface for this phase.

\- \[ ] A draft, a triage result and a summary are lost on refresh and are
not auditable after the fact, because ADR-023 Decision 11 persists no AI
output. There is also no acceptance-rate analytics and no caching, so
clicking twice bills twice.

\- \[ ] A failed `GET /ai/status` is deliberately indistinguishable from a
deliberately unconfigured server: both render the same quiet note. That
is the right call for an optional helper on a ticket page, but it does
mean a genuinely broken status endpoint is invisible to the user.

\- \[ ] The assistant is not surfaced anywhere but the ticket detail page —
no bulk triage, no assistant on the ticket list, and no suggestion at
creation time.

\- \[ ] The in-process concurrency cap that produces a `busy` 503 is
per-instance and would not hold behind more than one backend replica
(carried over from ADR-023's Consequences).



\---



\# Phase 13 — Testing \& Quality



\- \[ ] Review unit-test coverage

\- \[ ] Add backend integration tests

\- \[ ] Add frontend tests

\- \[ ] Create Playwright end-to-end tests

\- \[ ] Test authentication workflow

\- \[ ] Test ticket workflow

\- \[ ] Test SLA workflow

\- \[ ] Test asset workflow

\- \[ ] Test RBAC

\- \[ ] Test error handling

\- \[ ] Test important security scenarios

\- \[ ] Run complete test suite



\---



\# Phase 14 — Docker



\- \[ ] Create frontend Dockerfile

\- \[ ] Create backend Dockerfile

\- \[ ] Configure PostgreSQL container

\- \[ ] Create docker-compose configuration

\- \[ ] Configure environment variables

\- \[ ] Verify complete local environment

\- \[ ] Document Docker setup



\---



\# Phase 15 — CI/CD



\- \[ ] Create GitHub Actions workflow

\- \[ ] Install dependencies automatically

\- \[ ] Run lint checks

\- \[ ] Run type checks

\- \[ ] Run unit tests

\- \[ ] Run integration tests

\- \[ ] Build frontend

\- \[ ] Build backend

\- \[ ] Configure deployment workflow

\- \[ ] Verify CI pipeline



\---



\# Phase 16 — Deployment



\- \[ ] Select deployment platform

\- \[ ] Configure production environment

\- \[ ] Configure production database

\- \[ ] Configure secrets

\- \[ ] Deploy backend

\- \[ ] Deploy frontend

\- \[ ] Configure production CORS

\- \[ ] Verify production authentication

\- \[ ] Verify production API

\- \[ ] Verify production database

\- \[ ] Test production application



\---



\# Phase 17 — Final Review \& Portfolio Preparation



\- \[ ] Perform complete application review

\- \[ ] Review security

\- \[ ] Review performance

\- \[ ] Review accessibility

\- \[ ] Review responsive design

\- \[ ] Remove unused dependencies

\- \[ ] Remove debug code

\- \[ ] Review environment configuration

\- \[ ] Update README

\- \[ ] Add architecture diagram

\- \[ ] Add database diagram

\- \[ ] Document API

\- \[ ] Document technical decisions

\- \[ ] Create demo data

\- \[ ] Prepare interview explanation

\- \[ ] Prepare project demonstration

\- \[ ] Create final GitHub release

