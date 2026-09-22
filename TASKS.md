\# OpsNow Development Tasks



\## Project Status



Status: In Progress



Current Phase: Phase 17 — Final Review & Portfolio Preparation (NOT

started).

Phases 0–16 are complete. Phases 13 (Testing & Quality Hardening), 14

(Docker), 15 (CI/CD) and 16 (Deployment posture) landed in the

feature/phases-13-16-milestone branch.

Two of those are written but NOT verified by execution, and are marked

as such in their own sections below: the container images have never

been built (Docker is not installed on the development machine) and

the CI pipeline has never run (nothing has been pushed).

OpsNow is NOT deployed anywhere. No hosting account, managed database,

registry, domain or credential exists, which is why ten of Phase 16's

eleven items remain unchecked. The eleventh, "Configure production CORS",

is checked because its answer is that production CORS is deliberately

disabled (ADR-027), not because anything was deployed.



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

\- \[x] (Deferred, done in Phase 13) Rate-limit /auth/login and /auth/register — no

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

\- \[x] (Done) `GET /api/v1/tickets` answers 500, not 400, for an absurd but

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



\- \[x] Review unit-test coverage

\- \[x] Add backend integration tests

\- \[x] Add frontend tests

\- \[x] Create Playwright end-to-end tests

\- \[x] Test authentication workflow

\- \[x] Test ticket workflow

\- \[x] Test SLA workflow

\- \[x] Test asset workflow

\- \[x] Test RBAC

\- \[x] Test error handling

\- \[x] Test important security scenarios

\- \[x] Run complete test suite — run in full on 2026-09-22 at the close of

the milestone, after the `create-admin` CLI landed. Backend: `prisma

validate`, `prisma migrate status` (in sync), typecheck, ESLint at

`--max-warnings 0`, 864 unit tests across 44 suites, 350 e2e tests across

12 suites, `nest build`. Frontend: typecheck, ESLint, 481 vitest tests

across 39 files, `tsc --noEmit && vite build`, and 11 Playwright tests in

chromium. `npm audit` reports 0 vulnerabilities on both packages, at the

full tree and at CI's `--omit=dev --audit-level=high` gate. Everything

passed; nothing was skipped or marked as expected-to-fail.



What this does NOT cover, because the tooling is absent from this machine:

the container images (no Docker — see Phase 14), `docker compose config`,

`nginx -t` on `frontend/nginx.conf`, and `actionlint` over the CI

workflow. `.github/workflows/ci.yml` and `docker-compose.yml` were parsed

as YAML and read line by line instead, and every Dockerfile build target

CI references was confirmed to exist. CI remains the first place those

four run.



Phase 13 is hardening, not new functionality. What it actually changed:



\- Input validation: the `NoControlCharacters` validator now covers the

ticket, registration-name and free-text-search fields it had not reached.

A NUL byte in any of them previously became an unhandled 500 from the

Postgres driver rather than a 400.



\- Auth rate limiting (ADR-026): `/auth/login`, `/auth/register` and

`/auth/refresh` are throttled, closing the gap deferred from Phase 4, and

`TRUST_PROXY_HOPS` makes `req.ip` — which the throttle counts and the

audit log records — safe behind a reverse proxy.



\- Backend lint: ESLint with type-aware rules, `npm run lint`, at

`--max-warnings 0`. The backend previously had no linter at all.



\- Frontend: a render error boundary (a throw used to blank the whole

app) and a drift guard tying `FIELD_LIMITS` to the backend DTO caps.



\- Playwright: authentication and RBAC coverage in the browser, which the

suite had never had.



Not done, and deliberately so: no broad accessibility rework. The audit

found the existing UI already carries real labels, `aria-describedby`,

`aria-invalid`, `role="alert"` error regions, an accessible spinner name

and a skip link, so there was nothing worth churning.



\## Deferred from Phase 13 (tracked, not dropped)



\- \[ ] The auth throttle counter is per process (in-memory), so with more

than one backend replica the effective limit is the limit times the

replica count. Same single-instance assumption as ADR-023's AI

concurrency cap; a shared store would fix both at once.



\- \[ ] A 429 writes no audit row, because the guard rejects the request

before the service runs. Blocked attempts are therefore invisible in the

audit log, which is where an operator would look for evidence of an

attack. Same root cause as the Phase 11 item about rejected operations.



\- \[ ] The local Playwright suite needs the backend started with a raised

`AUTH_THROTTLE_LIMIT`. `global-setup.ts` detects the 429 and prints the

command, but it is still a manual step.



\- \[ ] `refresh_tokens` and `audit_logs` keep growing across e2e runs

(1386 and 973 rows on this machine before this milestone). Existing

suites clean up their tickets and assets but not their sessions. Related

to the Phase 11 deferred item on audit-row growth, and left for the same

reason: pruning is a deliberate human decision.



\---



\# Phase 14 — Docker



\- \[x] Create frontend Dockerfile

\- \[x] Create backend Dockerfile

\- \[x] Configure PostgreSQL container

\- \[x] Create docker-compose configuration

\- \[x] Configure environment variables

\- \[ ] Verify complete local environment — NOT DONE. Docker is not

installed on the development machine (`docker` is not on PATH and Docker

Desktop is not present), so no image has been built and the stack has

never been started. See the Phase 14 note below for what was verified

instead. This task is the single remaining Phase 14 item.

\- \[x] Document Docker setup



Phase 14 produces a production-SHAPED local stack: multi-stage images

for both halves, a non-root API process, no secret in any layer, health

checks, and schema migration as its own one-shot `prisma migrate deploy`

job rather than a step inside the API's start-up.



The API is deliberately not published to the host. OpsNow's refresh

cookie is `SameSite=Strict` and path-scoped, the backend enables no CORS

and rejects a cross-origin refresh, so the browser must see the API as

same-origin — which means through the frontend's nginx proxy. A second,

published route could not authenticate and would only confuse.



The stack cannot touch the host's development database: its own

container, its own named volume, database `opsnow` rather than

`opsnow_dev`, host port 5433 rather than 5432, no automatic seeding

(`prisma db seed` wipes every table, so it stays a deliberate manual

act), and `docker compose down` leaves the volume alone.



\### Verification status — read this before trusting the images



Docker is not available on this machine, so **the images have never been

built and the stack has never been started**. What was verified instead:



\- `docker-compose.yml` parses as YAML and its service graph, ports,

health checks and `depends_on` conditions were inspected.



\- argon2's shipped prebuilt binaries were checked (`linux-x64` and

`linux-arm64`, glibc and musl), confirming the images need no compiler

toolchain.



\- Both production bundles build (`nest build`, `tsc --noEmit && vite

build`).



\- The compiled backend was booted with `NODE_ENV=production` and

exercised: `/api/v1/health` reported the database up, and the auth

throttle answered 401/401/401/429 against a limit of 3.



\- `frontend/nginx.conf` has NOT been run through `nginx -t`.



`docs/docker.md` states this at the top and lists what to suspect if the

first build fails.



\## Deferred from Phase 14 (tracked, not dropped)



\- \[ ] Build and start the stack on a machine that has Docker, and fix

whatever the first run surfaces.



\- \[ ] `nginx:1.27-alpine` runs its master process as root (workers run

as `nginx`, the stock posture). `nginxinc/nginx-unprivileged` would run

everything unprivileged; it was not used because it could not be pulled

and tested here. The change is one base image plus moving the listener

from 80 to 8080.



\- \[ ] No image is published to a registry, and there is no tagging or

versioning scheme for them.



\- \[ ] Single replica of everything. The auth throttle (ADR-026) and the

AI concurrency cap (ADR-023) are both per-process, so a second API

replica multiplies both limits.



\---



\# Phase 15 — CI/CD



\- \[x] Create GitHub Actions workflow

\- \[x] Install dependencies automatically

\- \[x] Run lint checks

\- \[x] Run type checks

\- \[x] Run unit tests

\- \[x] Run integration tests

\- \[x] Build frontend

\- \[x] Build backend

\- \[ ] Configure deployment workflow — NOT DONE, deliberately. There is

no hosting target, registry, domain or credential to deploy to. A

workflow written against a target that does not exist, or one carrying

empty secret references waiting to be filled, is worse than an honest

gap. `docs/deployment.md` lists the external steps that must happen

first.

\- \[ ] Verify CI pipeline — NOT DONE. Nothing has been pushed, so no

workflow run exists. The file was parsed and its job graph, services,

health gates and permissions inspected, and every command it runs

passes locally — but that is not the same as a green run.



`.github/workflows/ci.yml` runs five jobs on push and pull request:

`frontend` (typecheck, eslint, vitest, build), `backend` (prisma

validate/generate/`migrate deploy`/`migrate status`, seed, typecheck,

eslint, unit, e2e, build, against a health-gated Postgres service),

`browser-e2e` (builds and starts the compiled API, waits on the real

health endpoint, runs Playwright, uploads traces on failure),

`dependency-audit` (`npm audit --omit=dev --audit-level=high` both

sides), and `docker` (builds all three image targets, renders

`docker compose config`, and syntax-checks `nginx.conf` inside the same

nginx version the image uses).



That last job matters more than usual: since Docker is not installed

locally, CI is the first place the Phase 14 images will actually be

built, and the first place `nginx.conf` will be syntax-checked.



Two choices worth recording. `migrate status` runs after

`migrate deploy` to catch a `schema.prisma` edited without a matching

migration, which otherwise passes every test and then fails at

deployment. And seeding is required in CI while being forbidden locally

— the difference is the database, not the command: `prisma db seed`

deletes every table, which is unacceptable against a developer's

`opsnow_dev` and correct against a service container created seconds

earlier. The e2e suites sign in as the seeded role accounts, so without

it they cannot run.



No credentials anywhere. The Postgres password and JWT value are literal

throwaways for a container that lives for one job, labelled as such.

`permissions: contents: read` is declared explicitly rather than

inherited.



\## Deferred from Phase 15 (tracked, not dropped)



\- \[ ] No deployment job, and none can be written until a target exists.



\- \[ ] No coverage reporting or threshold, and no lint/test result

annotations on a pull request.



\- \[ ] `actionlint` is not run over the workflow itself.



\- \[ ] Actions are pinned to major version tags rather than commit

SHAs, so a compromised tag would be picked up automatically.



\---



\# Phase 16 — Deployment



\- \[ ] Select deployment platform

\- \[ ] Configure production environment

\- \[ ] Configure production database

\- \[ ] Configure secrets

\- \[ ] Deploy backend

\- \[ ] Deploy frontend

\- \[x] Configure production CORS — the production CORS configuration is

**none**, deliberately, and that is a decision rather than an omission

(ADR-027). The deployment model is same-origin, so there is no

legitimate cross-origin browser caller to allow-list; an allow-list

would merely appear to enable a split-origin deployment that would then

fail at the first token refresh, because CORS does not make a

`SameSite=Strict` cookie travel. `assertTrustedOrigin()` remains the

enforcement.

\- \[ ] Verify production authentication

\- \[ ] Verify production API

\- \[ ] Verify production database

\- \[ ] Test production application



Every remaining box above is unchecked because it requires something

that does not exist: a hosting account, a managed database, a registry, a

domain, or a credential. None has been invented, and **OpsNow is not

deployed anywhere**. `docs/deployment.md` lists the ten external steps,

in order, and says which of them unlocks each of these tasks.



What Phase 16 DID deliver — none of it on the task list above, because

that list was written assuming a deployment would happen:



\- Swagger is now OFF by default in production and on by default

elsewhere, overridable both ways by `SWAGGER_ENABLED`, with a start-up

warning when it is enabled in production. Booting the compiled build

during Phase 14 showed `/api/docs` answering 200 under

`NODE_ENV=production` — a complete, unauthenticated, machine-readable

description of every route and role gate.



\- `GET /api/v1/health/live` alongside the existing readiness check. An

orchestrator RESTARTS a container that fails liveness, so a liveness

probe that pings Postgres turns a brief database blip into a rolling

restart of every instance.



\- `debug` and `verbose` logging dropped in production — the levels most

likely to carry request detail nobody reviewed for what it discloses.



\- Both policies extracted to `main.policy.ts` with tests, because

`bootstrap()` cannot be imported without starting an application and a

database, so a policy written inline there is never verified.



\- ADR-027: the origin model and why a split-origin deployment is

unsupported, the CORS decision, why security headers come from the edge

rather than helmet, and the statement that nothing is deployed.



\- `docs/deployment.md`: the operator-facing companion — every variable

with its production value, why `TRUST_PROXY_HOPS` is dangerous in both

directions, the migration rules, the absence of down-migrations and what

that means for rollback ordering, which probe goes where, what is and is

not in the logs, a pre-launch security checklist, and the external steps.



\## Deferred from Phase 16 (tracked, not dropped)



\- \[x] (Done) **No way to create the first administrator.**

`POST /auth/register` always creates an `Employee` and the role is not

settable through the API, while the seed script wipes the database and

must never run against a deployment, so a first real deployment needed a

one-off SQL promotion. Closed by `backend/src/cli/create-admin.ts`:

`node dist/cli/create-admin.js <email> --yes` promotes an existing,

non-deleted account. It ships in the backend image, never sets a

password, refuses rather than auto-confirms when stdin is not a terminal,

rehearses with `--dry-run`, refuses a disabled account unless

`--allow-inactive`, and writes with a conditional `updateMany` pinned to

the role it read. 41 unit tests. `docs/deployment.md` step 8 has the

operator instructions.



\- \[ ] A role change is not an auditable action. The `create-admin`

promotion above writes nothing to `audit_logs`, so the single most

permission-sensitive change in the system leaves no trace in the

application's own audit trail — the command prints a `RECORD` line for

the operator to file out-of-band instead. Closing this means adding a

role-change action to the closed `AuditAction` set in

`backend/src/audit/audit.constants.ts`, which is mirrored into

`frontend/src/types/api.ts` and held in step by

`frontend/src/features/audit/auditActions.test.ts` — a cross-package

change, and deliberately out of scope for the bootstrap gap. It would

also cover role changes made any other way, if an admin-facing role

endpoint is ever added.



\- \[ ] Logs are plain text with no request or correlation id, and there

is no log shipping. There is no error-reporting service on either side;

the frontend's error boundary logs to the browser console only.



\- \[ ] No backup or restore procedure, and no down-migrations — a schema

rollback means writing a new forward migration.



\- \[ ] Security response headers are sent by the edge (nginx) and not by

the application, so a different topology must replicate them.



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



\---



\## Phase 17a — UI/UX Product Polish (primary workstream, by project

owner direction)



The project owner judged, from manual use of the app, that interface

and product presentation was the biggest remaining weakness — not

missing features. This workstream was inserted ahead of the rest of

Phase 17's checklist and is now closed. It is presentation-only: no

API, auth, RBAC, ticket/SLA/asset/KB/analytics/audit/AI-assistant

behaviour, or database schema changed. `git diff --stat` against

`backend/` across the whole workstream is empty.



\- \[x] UI/UX Product Designer initial audit (full product-wide,

code-level — no rendered/screenshot verification was possible; see

below)

\- \[x] Design tokens (`frontend/src/index.css`): a brand accent hue

aliased to Tailwind's indigo scale, a card elevation/radius system

\- \[x] Shared `Card` primitive (`components/ui/Card.tsx`), replacing

hand-copied ad hoc card markup across every feature directory;

auto-generates `aria-labelledby` for its own heading

\- \[x] App shell: brand-coloured nav active state, header elevation,

wordmark treatment

\- \[x] App-wide focus-ring colour sweep onto the brand accent

\- \[x] Analytics charts (`BarList`, `ComplianceMeter`,

`CategoryAnalyticsPanel`) given real colour treatment; palette

validated with the dataviz skill's contrast/lightness validator

\- \[x] Audit log mobile-width fix: the one table with no responsive

treatment at all now collapses its least-critical column below `sm`

\- \[x] Content-shaped `DetailPageSkeleton` replacing blank-then-pop

spinners on the ticket/asset/article detail pages

\- \[x] UI/UX Product Designer second-pass review of the implemented

diff, and one correction pass (fixed an overclaiming code comment and

one missed spinner colour; verified — no code change needed — that

history-list rows are not double-nested inside another `Card`)

\- \[x] Senior Review of the full workstream diff (two passes,

covering every changed file except `AssetDetailPage.tsx`/

`ArticleDetailPage.tsx`'s full bodies beyond their Card migration,

`AssetTable.tsx`/`TicketTable.tsx`, `TicketAiAssistantPanel.tsx`,

`ArticleFeedbackWidget.tsx` and the knowledge-base pages in isolation

— closed out for those remaining files by a mechanical

open/close-tag-balance check across every file using `Card`, since

all of them pass the project's full test suite unchanged and follow

the identical, already-reviewed migration pattern). No CRITICAL or

HIGH finding anywhere.

\- \[x] Full regression after every checkpoint: `tsc --noEmit`,

`eslint .`, `vitest run` — 39 files, 481 tests, unchanged from the

Phase 13 baseline throughout.



Deliberately NOT done, tracked rather than silently dropped:



\- \[ ] No toast/notification system — the existing page-local

`InlineNotice` (`role="alert"`, embedded in each page's own layout)

was judged already functional, accessible and consistent; not

replaced.

\- \[ ] No shared `ResponsiveTable` primitive extracted —

`TicketTable`/`AssetTable` each still hand-roll their own desktop-

table/mobile-card dual render.

\- \[ ] No Modal/Drawer primitive — no concrete use case surfaced

during implementation, and `.claude/rules/ui-design.md` says not to

invent a pattern without one.

\- \[ ] `Badge.tsx`'s tone palette (sky/amber/emerald/red) left

unchanged — already good, accessible status colours, distinct from

the "everything is slate" problem the audit found in interactive

elements specifically.

\- \[ ] `LoginPage.tsx` not touched — still a generic centered form

with no brand treatment.

\- \[ ] Inline text links (ticket subjects, article titles, "View

details", ...) deliberately kept `text-slate-900 + underline` rather

than brand-coloured — a considered "quiet link" choice for data-dense

tables, not an oversight; only their focus rings carry the brand

accent.

\- \[ ] `AuditLogTable`'s Entity column is genuinely unavailable below

the `sm` breakpoint, with no recovery path via "View details" either

— a disclosed narrowing, not a fake fix, chosen specifically to avoid

a parallel mobile card list that would have made several existing

test assertions ambiguous in jsdom.



\*\*No visual/rendered verification was possible in this environment\*\*:

there is no browser automation tool available (no Claude in Chrome, no

built-in browser; `WebFetch` refuses `localhost`). Both the design

audit and the senior review were code-level only. The project owner

was informed of this limitation explicitly and chose to proceed on

that basis rather than pause the workstream. A real breakpoint/visual

walkthrough in an actual browser — and a proper accessibility review

(keyboard-only pass, screen reader spot-check, a contrast/axe scan of

the rendered page) — remain open and are folded into Phase 17's

existing "Review accessibility"/"Review responsive design" items

above, which are therefore still unchecked.



\---



\### Phase 17a-2 — Rendered-UI Correction Pass



After Phase 17a above closed (code-only review), the project owner

started both dev servers, manually inspected the actual running app on

desktop and mobile, and judged it "too flat, too sparse, too close to

a basic admin template" — a materially different verdict than the

code-only review could reach. This second pass corrected nine specific,

numbered problem areas named from that direct inspection: app shell/

navigation, page width/composition, ticket/asset tables, forms,

knowledge base, the SLA dashboard, analytics, the audit log, and mobile

responsiveness. Presentation-only, same as Phase 17a: `git diff --stat`

against `backend/` across the whole correction pass is empty.



\- \[x] `ui-ux-product-designer` produced a concrete correction spec from

the nine rendered findings (concrete Tailwind values/breakpoints, not

just adjectives)

\- \[x] App shell rewrite (`AppLayout.tsx`): two-tier header, a real

mobile nav drawer (focus-trap-ish: focus-to-first-link on open,

Escape-to-close-and-return-focus, backdrop click, closes on route

change, `invisible`/`visible` so closed-drawer links drop out of tab

order below `md`). Exactly ONE `<nav aria-label="Main">` and ONE

Sign-out button at all times — verified directly (not just via passing

tests) by both review passes, since jsdom's lack of CSS means a

duplicated instance would be a real, not merely cosmetic, regression.

Page shell widened `max-w-6xl` -> `max-w-7xl` with scaling gutters.

\- \[x] Table hierarchy (`TicketTable`, `AssetTable`, `AuditLogTable`,

`AgentAnalyticsPanel`, `CategoryAnalyticsPanel`, the SLA policy table):

header band, row separation/hover, `Card` surface — applied consistently

across all six tables, confirmed deliberate (not drifted) where one

detail differs between them (`focus-within` only on tables whose rows

contain a focusable link).

\- \[x] `AuditLogTable`: dropped `<code>` for the Action cell (judged the

single biggest "database dump" signal, independent of styling); gave

"View details" a real button-like affordance.

\- \[x] SLA dashboard: flat 7-tile grid regrouped into a lead figure plus

Response/Resolution subgroups, each non-neutral tile gets a shape-coded

glyph (not colour alone) — colour corrected from amber to red after the

design review flagged it didn't match `slaDisplay.ts`'s own

`Breached -> danger` vocabulary.

\- \[x] Forms: standalone create pages (ticket/asset/article) now wrap

their form in `Card`; the same form components' edit-in-place usage

(already inside an existing Card) verified NOT double-wrapped — the

form components themselves contain no `Card` import at all, so

double-wrapping is structurally impossible, not just avoided by

convention.

\- \[x] Knowledge base: search leads its own full-width row with an

icon and larger type (a bespoke input, not an override of the shared

`Input`'s hard-coded padding, since this project has no tailwind-merge);

article titles are now the dominant element in their card.

\- \[x] Second-pass design review (one real finding: the SLA glyph colour

above, fixed) and Senior Review (APPROVE, no CRITICAL/HIGH; a handful of

small-diff files — `index.css`, `Pagination.tsx`, `TicketAnalyticsPanel.tsx`

— and two table row bodies went unread by the reviewer due to its turn

limit but were independently confirmed via direct grep/read afterward).

\- \[x] Full regression at every checkpoint: `tsc --noEmit`, `eslint .`,

`vitest run` — 39 files, 481 tests, unchanged throughout.



Still open, same reasons as Phase 17a above: no rendered/visual

verification was possible in this environment (no browser tool), so a

real breakpoint walkthrough and a proper accessibility review remain

folded into Phase 17's "Review accessibility"/"Review responsive

design" items, which stay unchecked. Both dev servers were left running

throughout this pass (Vite/Nest watch mode live-reloaded every change)

so the project owner can inspect the corrected app without a restart.

---

### Phase 17b — Further UI/UX Polish and Demo Data

A third, smaller increment requested by the project owner on top of 17a/17a-2, using a fuller 20-area brief as a checklist. A concise design review (not a repeat of the full audit) inspected the current code against that brief and found most of it already satisfied by 17a/17a-2; it returned 5 concrete remaining gaps plus a data-shape recommendation. `git diff --stat` against `backend/src/` for the UI commit, and against `frontend/` for the seed commit, are both empty.

- [x] Design review against the full 20-area brief, confirming what 17a/17a-2 already closed and returning 5 concrete gaps + 1 data recommendation (not a re-audit)
- [x] SLA dashboard (`SlaDashboardPage.tsx`): the two remaining raw `rounded-md border` surfaces (the metric tiles and the lead "Open tickets with an SLA" figure) now use the shared `Card` surface classes; the policy table's Status column now renders a `Badge` (success/neutral) instead of plain text
- [x] Analytics dashboard: `StatTile` gained an `emphasis` prop (a red left-accent border + a `Badge tone="danger"` "Needs attention" label, never colour alone) wired to the SLA panel's in-flight-breach tile — the one concrete "what needs attention" signal the design review could add without a new backend aggregate or a charting dependency
- [x] Login page (`LoginPage.tsx`): brand wordmark badge, form wrapped in `Card`, page background raised so the form reads as a surface — closes the one page 17a explicitly left untouched
- [x] AI assistant panel: a small `aria-hidden` sparkle icon beside the heading, so it reads as visually distinct AI-generated territory. A `border-brand-200` alternative was considered and deliberately rejected — `Card`'s `className` prop is appended after its own hardcoded border color with no tailwind-merge in this codebase to resolve the conflict, and there is no existing precedent overriding it this way, so the outcome could not be verified without a browser
- [x] Demo seed data (`backend/prisma/seed.ts`): expanded from 5→53 tickets, 5→20 assets, 3→11 KB articles, deterministically (index-driven variation, no `Math.random()`). The 5 original hand-crafted narrative tickets are kept byte-for-byte. 10 of the new tickets are an in-flight SLA breach specifically so the new Analytics "Needs attention" tile is non-zero in fresh seed data, not just decorative volume. The 7 seeded accounts (email/password) are unchanged.
- [x] Senior Review of both commits (STANDARD tier, agreed): no CRITICAL/HIGH/MEDIUM findings. 5 LOW notes, all either confirmed already-safe-as-implemented (emphasis scoping, the Badge swap's test compatibility, `LoginPage`'s accessibility regions, the AI panel's accessible name) or a documented, explicitly non-blocking latent fragility — see the Deferred item below.
- [x] Full regression: frontend `tsc --noEmit`, `eslint .`, `vitest run` (481/481, unchanged), `vite build`; backend `prisma validate`, `tsc --noEmit`, `npm test` (864/864, unchanged), `npm run test:e2e` (350/350, unchanged) against the live reseeded `opsnow_dev`. Row counts spot-checked directly against the database, not just trusted from a subagent's report.

Deliberately NOT done, tracked rather than silently dropped:

- [ ] `seed.ts`'s synthetic `resolvedAt` for a resolved/closed ticket is computed as `createdAt + multiplier × resolutionTargetMinutes` with no upper-bound clamp to "now". Senior Review traced every current generation path and confirmed no ticket in today's 48-template array can actually produce a future-dated `resolvedAt`, so this is latent, not live. A future edit to `generatedTemplates` (reordering, inserting a template, changing a template's priority) could silently reintroduce it. A `Math.min(resolvedAt, new Date())`-style clamp would close it; deferred because it is not a live bug and the file should not be re-touched just to add a guard against a hypothetical future edit.
- [ ] Same open items as Phase 17a/17a-2: no rendered/visual verification was possible (no browser tool in this environment), so a real breakpoint walkthrough and a proper accessibility review remain folded into Phase 17's "Review accessibility"/"Review responsive design" items below, which stay unchecked.

