\# OpsNow Architecture Decisions



This document records important technical and architectural decisions made

during the development of OpsNow.



The purpose is to preserve the reasoning behind decisions so that development

can continue consistently across different AI agent sessions and so the

architecture can be clearly explained during technical interviews.



\---



\## ADR-001 — Full-Stack Architecture



Status: Accepted



Decision:



OpsNow will use a separate React frontend and NestJS backend communicating

through a REST API.



Reason:



This separation demonstrates clear frontend/backend responsibilities and

provides practical experience building and consuming APIs.



\---



\## ADR-002 — Frontend Framework



Status: Accepted



Decision:



Use React with TypeScript and Vite.



Reason:



React is widely used for modern web applications, while TypeScript provides

strong typing and improves maintainability. Vite provides a lightweight and

fast development environment.



\---



\## ADR-003 — Backend Framework



Status: Accepted



Decision:



Use NestJS with Node.js and TypeScript.



Reason:



NestJS provides a structured backend architecture with modules, controllers,

services, dependency injection, validation and testing support. This makes

it suitable for demonstrating professional backend development practices.



\---



\## ADR-004 — Database



Status: Accepted



Decision:



Use PostgreSQL as the primary relational database.



Reason:



OpsNow contains strongly related business entities including users, roles,

tickets, assets, SLA policies, knowledge articles and audit records.

PostgreSQL is well suited to these relationships and provides strong SQL

capabilities.



\---



\## ADR-005 — Authentication



Status: Accepted



Decision:



OpsNow will use token-based authentication with short-lived JWT access

tokens and longer-lived refresh tokens.



Implementation detail:



\- Access tokens: short-lived JWTs (10–15 minutes), sent via

`Authorization: Bearer`.

\- Refresh tokens: stored server-side hashed with SHA-256, and issued to

the client only as an httpOnly, Secure, SameSite=Strict cookie — never

stored in localStorage or exposed to JavaScript.

\- Passwords are hashed using Argon2id.

\- These two hashing algorithms are deliberately different and must not be

conflated: Argon2id (slow, memory-hard) is for passwords, which are

low-entropy human-chosen secrets that must resist offline brute-force

guessing. SHA-256 (fast) is for refresh tokens, which are already

high-entropy, randomly generated values — hashing them with a slow,

memory-hard algorithm on every authenticated request would add

unnecessary computational overhead with no corresponding security

benefit.



Reason:



The application requires authenticated users and protected API resources.

The implementation must provide secure authentication while keeping the

frontend and backend responsibilities clearly separated. httpOnly cookies

protect refresh tokens from XSS-based exfiltration, and Argon2id is a

current recommended password-hashing algorithm. Refresh tokens use

SHA-256 rather than Argon2id specifically because they are not

human-chosen secrets, so a fast cryptographic hash is sufficient and

appropriate.



\---



\## ADR-006 — Authorization



Status: Accepted



Decision:



OpsNow will implement backend-enforced role-based access control (RBAC)

using a fixed set of roles.



Roles:



\- Employee

\- Support Agent

\- Team Lead

\- Administrator



Implementation detail:



\- Roles are stored as a fixed enum on the user record, not a dynamic

permissions table.

\- Authorization is enforced in the NestJS backend via guards and role

decorators on every protected route. Frontend role-based UI is cosmetic

only and is never relied upon for security.



Reason:



Different users require different levels of access. Authorization must be

enforced by the backend rather than relying only on frontend visibility.

A flat role enum is sufficient for four fixed roles and is simpler to

build, test and explain than a granular permissions system; that can be

revisited later if a concrete need for finer-grained permissions arises.



\---



\## ADR-007 — API Style



Status: Accepted



Decision:



Use RESTful HTTP APIs for communication between the React frontend and

NestJS backend. The API is versioned from the start under `/api/v1/...`

to allow non-breaking evolution as the application grows.



Reason:



REST provides a clear and widely understood interface for this application

and is appropriate for demonstrating full-stack API development.



Addendum (Phase 5):



Paginated list endpoints return `{ data: T[], total: number }`, with

`limit`/`offset` query parameters (`limit` defaulting to 20, capped at 100).

`GET /api/v1/users` (Phase 5) is the first endpoint to use this shape; later

list endpoints (tickets, assets, knowledge-base articles, etc.) should reuse

it rather than inventing a different envelope per resource.



\---



\## ADR-008 — Testing



Status: Accepted



Decision:



Use automated testing at multiple levels, with each application using the

testing tool best aligned to its own ecosystem.



Tools:



\- Jest for backend (NestJS) unit and integration testing

\- Supertest for backend API/integration testing

\- Vitest for frontend unit and component testing

\- Playwright for end-to-end testing



Reason:



The project should demonstrate that features are verified rather than only

implemented. Jest is used for the backend because it is NestJS's default

and best-supported test runner; Vitest is used for the frontend because it

is Vite's native test runner. Splitting by ecosystem avoids forcing one

runner onto a framework where it is not the natural fit.



\---



\## ADR-009 — Containerization



Status: Accepted



Decision:



Use Docker for the local development environment.



Reason:



Containerization provides a reproducible development environment and

demonstrates practical deployment and infrastructure skills.



\---



\## ADR-010 — CI/CD



Status: Accepted



Decision:



Use GitHub Actions for continuous integration and deployment automation.



Reason:



Every meaningful change should be automatically checked through linting,

type checking, testing and builds before deployment.



\---



\## ADR-011 — AI Integration



Status: Planned



Decision:



AI will be used as an optional supporting capability rather than the core

application architecture.



Initial use case:



AI-assisted ticket analysis.



Potential capabilities:



\- Category suggestion

\- Priority suggestion

\- Knowledge article suggestions

\- Suggested response generation

\- Resolution summary generation



Reason:



The application should demonstrate genuine full-stack engineering first.

AI should solve a useful business problem rather than exist only as a

demonstration feature.



\---



\## ADR-012 — Development with AI Agents



Status: Accepted



Decision:



AI agents will be used to assist with development, but all generated work

must be verified through tests, code review and Git checkpoints.



Reason:



OpsNow is intended to demonstrate both software engineering capability and

responsible AI-assisted development.



The repository must remain understandable and maintainable without relying

on previous AI conversation history.



\---



\## ADR-013 — Project State Management



Status: Accepted



Decision:



Project state will be maintained through:



\- CLAUDE.md

\- TASKS.md

\- progress.md

\- DECISIONS.md

\- Git history

\- Automated tests



Reason:



The project must be able to survive Claude usage limits, context limits,

interrupted sessions, terminal closure and other development interruptions.



A new AI session should be able to reconstruct the current project state

from the repository itself.



\---



\## ADR-014 — ORM and Database Migrations



Status: Accepted



Decision:



Use Prisma as the ORM and migration tool for PostgreSQL.



Reason:



Prisma provides type-safe database access that matches the project's

TypeScript-first approach, and its migration system (`prisma migrate`)

serves as the single source of truth for database schema. Schema changes

are made only through migrations, in every environment including local

development — no schema auto-sync is used anywhere.



\---



\## ADR-015 — Primary Key Strategy



Status: Accepted



Decision:



Use UUID primary keys for all database tables.



Reason:



UUIDs avoid exposing sequential record counts through public-facing

identifiers such as ticket numbers and asset tags, and are simpler to

generate safely than coordinating auto-incrementing integers across

future distributed scenarios. The minor storage and index overhead

compared to integer keys is an acceptable trade-off at this project's

scale.



\---



\## ADR-016 — Frontend Styling



Status: Accepted



Decision:



Use Tailwind CSS for frontend styling.



Reason:



Tailwind provides a consistent, utility-based styling approach that fits

a component-driven React architecture and avoids maintaining a separate

hand-written CSS or design-system layer for a project of this scope.



\---



\## ADR-017 — Repository and Infrastructure Simplicity



Status: Accepted



Decision:



OpsNow will remain a single Git repository without monorepo tooling (Nx,

Turborepo, npm/yarn/pnpm workspaces), microservices, or message queues.



Reason:



The application's scope does not currently justify the operational and

cognitive overhead of multi-package build orchestration, service

decomposition, or asynchronous messaging infrastructure. Backend domains

communicate in-process, and the frontend and backend remain two plain

applications within one repository.



\---



\## ADR-018 — Default-Deny Route Protection



Status: Accepted



Decision:



Every backend route requires a valid access token by default. This is

enforced by registering `JwtAuthGuard` as a global `APP_GUARD`; a route

must opt out explicitly with a `@Public()` decorator to be reachable

without authentication.



Options considered:



\- Per-route `@UseGuards(JwtAuthGuard)`, applied only where authentication

is required. Rejected: a controller or route added later that forgets

the guard fails open — it is silently unprotected rather than erroring.

\- Global guard with an explicit `@Public()` opt-out (chosen). A route

added later without `@Public()` fails closed — it requires

authentication by default, and the omission is easy to notice in review

("why doesn't this have `@Public()`?") rather than easy to miss.



Reason:



Authentication is "Sensitive Functionality" and the constitution's

security rules say "when in doubt, treat as sensitive." A default-deny

posture matches that: the safe outcome is what happens automatically, and

an engineer has to make a deliberate, visible choice to relax it for a

specific route (health check, registration, login, refresh).



Consequences:



Every future public route (and every PR reviewing one) must remember

`@Public()`. Swagger's `/api/docs` is unaffected — it is mounted as raw

middleware outside Nest's controller/route pipeline, not a guarded route.



\---



\## ADR-019 — Ticket Access Control and State Transitions



Status: Accepted



Context:



Phase 6a introduces the project's first resource where authorization

depends on data, not just role: an Employee may only see and act on

tickets they themselves filed, while Support Agent/Team Lead/Administrator

may see and act on any ticket. `RolesGuard` (ADR-006/018) only answers "is

this role allowed to hit this route at all" — it has no way to answer "is

this specific row this user's to see." Phase 6a also introduces the

project's first non-trivial state machine (`TicketStatus`), and the first

case where "the resource exists but isn't yours" needs a consistent answer

about what the caller is told.



Problem:



Three related questions needed a project-wide answer, not a per-endpoint

improvisation: (1) where does per-row ownership get enforced, given guards

can't do it; (2) what does an out-of-scope resource return — 404 or 403;

(3) how are ticket status changes validated so they're actual "status

management," not a bare enum write.



Options considered:



For (1): a generic authorization/policy engine (e.g. a CASL-style ability

system) evaluated per-request; a custom `@Owns()` decorator plus a third

global guard mirroring `RolesGuard`'s shape; or plain service-layer query

scoping. The first two were rejected as premature for a single resource

type — ADR-006 already commits to revisiting finer-grained permissions

"later if a concrete need arises," and a policy engine derived from one

example is exactly the kind of speculative abstraction the constitution's

Scope Control warns against. A guard was rejected for a structural reason,

not just a style preference: a guard can decide yes/no on a request it has

already been handed, but it cannot narrow a `WHERE` clause — it cannot make

a list endpoint only ever fetch the caller's own rows in the first place.



For (2): returning 403 for every out-of-scope ticket, matching typical

REST intuition ("you don't have permission"); or 404, treating an

out-of-scope ticket as indistinguishable from a nonexistent one.



For (3): a bare `status: TicketStatus` field update validated only by the

enum type; or an explicit transition matrix enforced in the service layer.



Decision:



1. Ownership is enforced by a single service-layer helper

(`ticketVisibilityWhere(user)`) that every ticket query — list, get-by-id,

and the lookup inside every mutating method — passes through. For an

Employee it adds `requesterId: user.id`; for staff it adds nothing beyond

excluding soft-deleted rows. No policy engine, no ownership guard.



2. A ticket outside the caller's scope (wrong owner, or soft-deleted)

returns 404, not 403, on every ownership-checked route that takes a ticket

id — `GET`, `PATCH`, comment creation, and comment listing. The three

routes gated purely by role (`assignment`, `priority`, `history`) return

403 for a non-staff caller before the ownership check ever runs, id-

independent of whether the ticket exists — that is a role decision, not an

ownership one, and is unaffected by this rule. A ticket that *is* in scope

but where the specific action is disallowed (e.g. the requester editing

their own ticket after it has left `New`) also returns 403, since the

caller already knows the ticket exists.



3. Ticket status changes are validated against an explicit

`ALLOWED_TRANSITIONS` matrix (`tickets.constants.ts`), not a free-form

enum write. `Closed` is a terminal state in Phase 6a: no role, including

Administrator, can transition a `Closed` ticket anywhere else. A closed

issue that recurs is filed as a new ticket rather than reopening the

historical one. The only reopen path is `Resolved` → `Open`, and only the

ticket's own requester (in addition to any staff role) may perform it.

Every status change funnels through one `applyStatusTransition()` method.



Rationale:



Query-scoping is the only one of the three ownership options that can

actually prevent an Employee's ticket list from ever containing another

employee's row — a guard or policy check applied after the query runs can

only filter or reject a response that has already been assembled, which is

strictly weaker. 404-over-403 avoids confirming a ticket id's existence to

someone not entitled to know about it, at the cost of an Employee seeing

"not found" instead of "forbidden" for a ticket that does exist — judged an

acceptable trade favoring the party who would otherwise leak information

about other employees' tickets. Terminal `Closed` was a deliberate product

decision (not a default): a closed issue reopening into its old history is

a source of stale-context confusion in real ITSM tools, and a fresh ticket

is a cleaner unit of work; this is revisitable if a concrete need for

closed-ticket reopening arises later, the same way ADR-006 left room for

revisiting RBAC granularity.



Consequences:



Enforcement lives in the service layer, not in a guard or middleware — a

future controller or script that reaches `PrismaService` directly instead

of going through `TicketsService` would bypass `ticketVisibilityWhere`

entirely. Every new ticket-adjacent read must remember to route through the

helper; there is no framework-level backstop the way there is for

authentication (ADR-018) and role checks (ADR-006). The schema also has a

generic `AuditLog` model in addition to `TicketHistory`; Phase 6a writes

only `TicketHistory` (what TASKS.md's checklist names), and the boundary

between the two audit mechanisms is left for whichever future phase owns

`AuditLog` to resolve, not decided here.



Risks:



If a later phase adds a second resource with the same per-row-ownership

shape (e.g. assets scoped to their current holder), duplicating

`ticketVisibilityWhere`'s pattern by hand a second and third time is a

signal — not yet a requirement — to revisit whether a shared abstraction

has become justified; until then, per ADR-006 and this ADR, one-off

service-layer helpers remain the simpler and better-understood choice.



---



\## ADR-020 — SLA Calculation, Pause Semantics, and Concurrency Model



Status: Accepted



Context:



Phase 7 adds per-ticket SLA tracking (response and resolution due dates,

breach/at-risk state) on top of Phase 6a's ticket lifecycle and its

existing optimistic-concurrency (CAS) pattern for status/assignment/

priority mutations (ADR-019). SLA data must stay consistent under the

same concurrent-mutation conditions Phase 6a already defends against,

plus two conditions unique to SLA: a clock that can be paused and

resumed (`OnHold`), and a completed clock that can effectively

un-complete (`Resolved -> Open` reopen).



Problem:



Four questions needed a single, explicit answer rather than per-hook

improvisation: (1) how is a ticket's SLA commitment determined, and can

it drift after the fact; (2) how does pausing/resuming avoid either

freezing or falsely burning down the clock; (3) what happens to a

completed SLA clock when a resolved ticket reopens; (4) how do SLA

writes avoid corruption when they race the ticket mutations that

trigger them, or each other.



Options considered:



For (1): recomputing due dates on every read from whatever policy is

currently active for the ticket's priority, vs. snapshotting the

policy's targets onto the ticket at creation. For (2): representing

pause as a status flag consulted only at read time, vs. shifting the

persisted due dates by the elapsed pause duration once the pause ends.

For (3): giving a reopened ticket a brand-new SLA cycle, vs. crediting

the resolved-to-reopened interval as if it were a pause. For (4):

computing SLA timestamps in application code and writing them with a

plain `UPDATE`, vs. confining every SLA-clock mutation to a single

parameterized `$executeRaw` statement that reads its own inputs from

the database row inside that same statement. A background scheduler

that periodically recomputes and persists breach/at-risk state was also

considered and rejected for Phase 7 (see Decision 8).



Decision:



1. Policy snapshotting. `attachOnCreate` selects the active `SlaPolicy`

for the ticket's priority — priority is the only selection criterion —

and copies its `responseTimeMinutes`/`resolutionTimeMinutes` onto the

new `TicketSla` row as `responseTargetMinutes`/`resolutionTargetMinutes`,

alongside `responseDueAt`/`resolutionDueAt` computed from the ticket's

own DB-assigned `createdAt`. A later edit or deactivation of the policy

never retroactively changes a ticket already attached to it. If no

active policy exists for the priority, the ticket is created without a

`TicketSla` row and only a warning is logged — an SLA configuration gap

must never block ticket intake.



2. Two independent clocks. Response and resolution each have their own

target, due date, and derived state (`Running`/`AtRisk`/`Breached`/

`Paused`/`Met`, plus `NoResponse` for the response clock only — a

ticket resolved without ever getting a qualifying reply is a first-class

outcome, not an error). "At risk" is `remainingMinutes <= 0.2 *

targetMinutes` (`AT_RISK_FRACTION`), a fraction rather than a fixed

number of minutes because targets range from 15 minutes (Critical

response) up to 1440 minutes/24h (Low resolution).



3. Pause is due-date shifting, not clock-stopping. Entering `OnHold`

records `on_hold_started_at = now()` using the database clock. Leaving

`OnHold` — to any destination status — adds the elapsed `now() -

on_hold_started_at` onto both `response_due_at` and `resolution_due_at`

in the same statement, then clears the anchor. While paused,

`remainingMinutes` is computed against the pause's start instant rather

than the still-unshifted due date, so the reported remaining time holds

constant instead of appearing to burn down during the hold.

`total_paused_minutes` accumulates for display only; it is never read

back into an authoritative SLA calculation.



4. First response qualifies narrowly. A response is recorded only for a

`Public`-visibility comment from a staff-role author who is not the

ticket's own requester (a staff member who filed their own ticket can

never satisfy their own response SLA; `Internal` notes never qualify).

The write is guarded by `response_at IS NULL`, making it exactly-once

by construction — a second qualifying reply, including a concurrent

one, is a silent no-op. `responseAt`/`responseBreached` are only ever

set together, only once, from the qualifying comment's own `createdAt`

— never fabricated, never backfilled from a separately read clock.

A reply CAN arrive while `on_hold_started_at` is set (OnHold, or

Resolved-pending-reopen per Decision 5 below) — `response_due_at` is

NOT yet shifted in that case, since the shift only happens on resume.

Breach is therefore decided by whether the PAUSE ITSELF started after

the due date had already passed (`on_hold_started_at > response_due_at`),

never by comparing the reply's timestamp against the still-unshifted

due date — the latter would falsely burn down a paused clock, exactly

what this decision exists to prevent, and was a defect caught by

independent review before this ADR's first merge (see the note at the

end of Risks).



5. Reopen reuses the pause mechanism, not a new cycle.

`onHoldStartedAt` is a dual-purpose clock-stop anchor: resolving a

ticket (either `->Resolved` or a direct `->Closed`) records the

resolution outcome and sets `on_hold_started_at = now()` — the

DATABASE clock, deliberately not the ticket's own `resolved_at` (which

is written from application-code `new Date()` in Phase 6a, not a

DB-computed default) — repurposing the same column pause uses as a

general "clock stopped at" marker for a second, mutually exclusive

reason: "resolved, pending a possible reopen." Reopening

(`Resolved -> Open`, the only reopen path) then runs the identical

resume statement used for leaving `OnHold`: it credits

`now() - on_hold_started_at` onto both due dates as if the resolved

interval were a pause, clears the anchor, AND resets `resolution_breached`

back to `false` — necessary because a ticket can carry a `true` value

from an earlier resolve-then-reopen cycle into a later OnHold spell,

and without the reset that stale flag would still be counted by

`getMetrics`' `resolutionBreachedCompleted` aggregate for a ticket that

is no longer resolved at all. `resolutionBreached` itself is still

decided from the real, application-recorded `resolved_at` (the

anchor's clock domain and the breach decision's timestamp domain are

deliberately different: the anchor must stay DB-clock so a LATER

resume's `now() - anchor` never mixes clock domains, while the breach

decision is inherently about the actual application-recorded resolution

instant). The two anchor purposes never collide, because `status` is a

single enum value and an `OnHold -> Resolved` transition always clears

the anchor via the resume path before the resolution hook sets it

again. `Closed` remains terminal (ADR-019); a `Closed` ticket's SLA

clocks are never touched again.



6. Priority change re-derives targets, not the whole row.

`handlePriorityChange` looks up the active policy for the new priority

and applies the delta between the new and the row's currently stored

target minutes to both due dates in one statement, updates the stored

targets and `sla_policy_id`. If no active policy exists for the new

priority, the existing SLA snapshot is left unchanged (warning only,

never blocking); a ticket with no `TicketSla` row at all is a no-op.

The SAME no-op-with-warning treatment applies once the ticket has

already resolved at least once (the caller passes its own `resolvedAt`

in): shifting either due date on a clock that has already completed

(or is pending reopen) is meaningless and would desynchronize the

due dates from the target minutes and the already-persisted breach

flag, so the entire delta — not just the breach flag — is left alone.

Phase 6a's own priority-change behavior (that staff may change a

Resolved or Closed ticket's priority at all) is unaffected; only this

SLA side-effect is skipped.



7. Concurrency model. Every SLA-clock write is a single parameterized

`$executeRaw` statement (never `$executeRawUnsafe`) that (a) is a pure

additive/commutative delta — `due_at = due_at + delta` — never an

absolute reconstruction, and (b) reads whatever anchor or current value

it needs (`on_hold_started_at`, the stored target minutes, `resolved_at`)

from the database row inside that same statement, never from a value

read earlier in application code and passed in. This makes every hook

immune to the ABA hazard of an interleaved pause/resume, or a `Resolved

-> Open -> ... -> Resolved` cycle, silently over- or under-crediting

time — there is no stale application-level read followed by a delayed

timing update. Every SLA hook is called from inside `TicketsService`'s

existing transaction, strictly after the corresponding ticket-row CAS

(`updateMany` + `count !== 1` -> `409 Conflict`, the pattern already

established for `assign`/status transitions in Phase 6a) has already

succeeded — never before, and never on a failed CAS. `updatePriority`,

which previously used a plain `update`, is extended to the same CAS

pattern in this phase specifically so a concurrent priority change can

never apply its SLA delta twice.



8. No background scheduler in Phase 7. Breach and at-risk state are

pure functions of stored due dates and the current instant

(`sla.calculations.ts`), computed at read time, never a status

persisted by a poller or cron job. The persisted `responseBreached`/

`resolutionBreached` columns are written exactly once, only when their

clock actually completes, and are trustworthy only then; an incomplete

clock's breach/at-risk state is always derived fresh on read rather

than trusted from those columns. This avoids both a missed-write

staleness window and the operational cost of a scheduler, at the cost

of doing the derivation work on every read instead of once per tick —

judged the right trade for Phase 7's read volume. SLA analytics/

dashboards beyond the narrow metrics in this phase, and any future need

for a scheduler-driven notification (e.g. "breach imminent" alerts),

are left to Phase 10, not decided here.



Rationale:



Snapshotting at creation (Decision 1) is what makes a ticket's SLA

commitment a fact about that ticket rather than a moving target of

current policy configuration — the alternative (recompute from current

policy on every read) would silently change a ticket's due dates

whenever an administrator edited or deactivated a policy, which is not

how SLA commitments work in practice. Due-date shifting (Decision 3)

was chosen over a stored "paused" flag because a flag still needs the

same shift computed at read time on every request for the life of the

pause, repeatedly, whereas shifting once at resume computes it exactly

once and lets every subsequent read stay a simple comparison. Reusing

the pause mechanism for reopen (Decision 5) is not a shortcut of

convenience: crediting resolved-to-reopened time as paused time is the

same time-elapsed-but-shouldn't-count-against-the-team semantic already

established for `OnHold`, so introducing a second, parallel mechanism

for the same idea would be needless duplication of exactly the kind the

constitution's Scope Control warns against. Confining every mutation to

a same-statement read-then-write (Decision 7) was chosen over reading

state in application code and writing it back because the latter has a

window between the read and the write in which a concurrent hook can

invalidate the value that was read — the same class of bug the CAS

pattern in ADR-019 already exists to prevent.



Consequences:



`SlaService` owns every `TicketSla` database access; `TicketsService`

never touches the `ticket_sla` table directly, and the dependency

direction is `tickets -> sla` only (`SlaService` must never import

`TicketsService`; `ticket-visibility.ts` was extracted out of

`TicketsService` specifically so `SlaService` can scope its own

staff-only reads without that import). Every SLA hook is a silent no-op

or a logged warning on a missing policy, never a thrown error — an SLA

configuration gap must never block ticket creation, comments, status

changes, or priority changes. The read model (`toTicketSlaResponse`) is

the only place breach/at-risk state is computed for an incomplete

clock; any future consumer of `TicketSla` (a dashboard, a report) must

go through it or the same derivation rather than reading the persisted

breach columns directly, or it will misreport an in-flight clock as

never breaching. Because there is no scheduler, nothing proactively

notifies anyone of an approaching breach — that remains a manual/

polling concern for whichever client renders the SLA state until

Phase 10 addresses it.



Risks:



The pause/reopen dual use of `on_hold_started_at` (Decision 5) is a

deliberate space-saving reuse of one column for two mutually-exclusive

meanings; it is correct only because the ordering guarantee in

Decision 7 holds (resume-before-resolve on every status path) — a

future change to `applyStatusTransition` that reorders those calls, or

a new status-transition path that bypasses it, would silently corrupt

SLA timing without a schema-level safeguard to catch it.

`total_paused_minutes` is display-only by design (Decision 3); if a

later phase is tempted to use it in an authoritative calculation, it

will be wrong the moment any priority-change delta (Decision 6) has

occurred, since that delta is never reflected in the paused-minutes

counter. Read-time derivation (Decision 8) means SLA state for a large

ticket list costs proportionally more compute than a precomputed column

would at very high read volume; this is an acceptable and revisitable

trade at the project's current and expected scale, not a permanent

constraint. The invariant in Decision 5 that the pause/reopen anchor

stays entirely within the database clock domain (never the

application-clock `resolved_at`) is enforced only by code discipline in

`SlaService`, the same way the resume-before-resolve ordering above is

— there is no schema-level constraint preventing a future edit from

reintroducing either mixed-clock-domain reads or reordered hook calls;

a regression test exists for the ordering (`sla.e2e-spec.ts`), which is

the practical backstop until/unless a stronger mechanical guard is

judged worth the complexity.



Independent QA/Security and Senior Review, run before this ADR's first

merge, found and this ADR's text was corrected to reflect four defects

that an earlier draft of this same design did not account for: (a)

Decision 4's pause interaction with first-response breach detection

(the original text compared a reply's timestamp against the

still-unshifted due date, which could permanently mis-record a breach

for a response given while genuinely paused); (b) Decision 5's reopen

anchor originally used the application-clock `resolved_at` rather than

`now()`, violating this ADR's own single-clock-domain requirement; (c)

`resolution_breached` was not reset on resume/reopen, letting a stale

`true` flag persist into the metrics aggregate for a ticket no longer

resolved; and (d) Decision 6 originally left a completed clock's target

minutes and due dates only partially guarded, rather than skipping the

delta outright. All four were fixed in code, with regression tests

(unit and e2e) added for each, before this design was accepted as

final — recorded here so the ADR is an accurate history of the design,

not a rewrite that erases that these were caught by review rather than

anticipated from the start.



\---



\## ADR-021 — Frontend SLA Rendering Model



Status: Accepted



Context:



Phase 7a gave every ticket an `sla` payload (ADR-020): two clocks, each

carrying a backend-derived state string, a due date, and a

clamped-and-pause-frozen `minutesRemaining`. Phase 7b renders that

payload — an SLA panel on the ticket detail page, one indicator per

ticket-list row, and a staff-only dashboard over the existing

`GET /sla-policies` and `GET /sla/metrics`.



This ADR covers presentation only. It does not change, restate or

re-decide any part of ADR-020's backend model.



Problem:



Four rendering questions have answers that are not obvious from the code

and that a future contributor would reasonably decide differently:

(1) where met/breached/at-risk meaning comes from once the payload is in

the browser; (2) what a countdown between refetches is actually measured

against; (3) which clocks may tick at all, and how many timers that

costs; (4) what should happen when a local countdown reaches zero.



Options considered:



For (1): deriving state in the browser by comparing the due date against

`Date.now()` — the due date is already on the wire, so this needs

nothing new — versus treating the backend's `responseState` and

`resolutionState` strings as authoritative and never recomputing them.



For (2): recomputing remaining time as `dueAt - Date.now()`; ageing the

backend's own `minutesRemaining` from TanStack Query's `dataUpdatedAt`;

or ageing it from an instant captured locally when the payload was first

received.



For (3): one `setInterval` per rendered countdown, which is simple and

local, versus a single module-level timer that every countdown

subscribes to; and separately, whether paused and finished clocks should

tick at all.



For (4): refetching the ticket, or invalidating its query, when a local

countdown hits zero, versus leaving staleness entirely to TanStack

Query's existing lifecycle.



Decision:



1\. Backend state is authoritative. `responseState` and `resolutionState`

decide every badge, tone and piece of wording. The frontend never

derives met/breached/at-risk from a due date and the browser clock.

`features/sla/slaDisplay.ts` is the single place a state string becomes

a view, and it reads no clock at all.



2\. The countdown ages `minutesRemaining`, anchored locally. The

displayed figure is `minutesRemaining - (now - anchor) / 60000`, where

`anchor` is the instant a countdown first RENDERED with this exact SLA

payload (`useSlaAnchor`, keyed on the payload's object identity, which

TanStack Query's structural sharing holds stable until the numbers

actually change). Anchoring at render rather than at receipt is a

deliberate simplification with a bounded cost, recorded under

Consequences. Keying on identity rather than on value is also what makes

that ref write idempotent under StrictMode's double render: the second

render sees the same object and leaves the instant alone. Remaining time

is never computed from `dueAt - Date.now()`, and elapsed time is floored

at zero — which matters on the ordinary path and not merely for a

backwards system-clock jump, because the shared ticker's last published

tick can legitimately be older than a countdown that mounted after it.



Specifically NOT `dataUpdatedAt`: `useTicketList` renders with

`placeholderData: keepPreviousData`, and during a filter or page change

the result carries the NEW query's `dataUpdatedAt`, which is `0` — the

epoch. Every visible row would age by decades and read "Due now". A

regression test covers this.



3\. Only live clocks tick. A paused clock displays its frozen

`minutesRemaining` — while paused the due dates have not been shifted

yet, so nothing else would be correct — and a finished clock (met,

breached, or resolved-without-response) displays no remaining figure at

all, because `minutesRemaining` keeps decaying against wall-clock time

there and means nothing. Neither subscribes to the ticker, so "does not

tick" is structural rather than incidental.



4\. One shared, visibility-aware timer. `features/sla/slaTicker.ts` holds

a single module-level 30-second interval behind `useSyncExternalStore`:

it starts on the first subscriber, stops on the last, stops while

`document.hidden`, and publishes once immediately on return to

visibility. Twenty list rows cost one timer, and every countdown on the

page moves together.



5\. A countdown reaching zero triggers nothing. No refetch, no

invalidation, no request of any kind. Staleness is handled entirely by

TanStack Query's existing lifecycle, exactly as it is for every other

field on a ticket. Stated precisely, because it is easy to assume more

than is there: `lib/api/queryClient.ts` sets `refetchOnWindowFocus:

false` for every query in the project, so that lifecycle here is

`staleTime` (10 seconds) plus refetch-on-mount, and nothing else. This

decision does not rely on refetch-on-focus and must not be read as doing

so.



6\. Local arithmetic may only ever shrink a figure to "Due now". It never

renders a negative number, and never produces the words "overdue" or

"breached" — those come only from a backend state string.



Rationale:



Deriving state client-side would make a ticket's SLA status depend on

the viewer's system clock: two people could disagree about whether the

same ticket had breached, and a skewed laptop could contradict the

metrics the same backend computes for the dashboard. Worse, several of

ADR-020's states cannot be derived client-side at all — `Met` versus a

late-but-recorded `Breached` depends on a persisted flag, and

`NoResponse` depends on the ticket having resolved without a qualifying

reply — so a client-side rule would have to be partial, and a partial

rule is more dangerous than none. `{ AtRisk, minutesRemaining: 0 }` is

reachable for roughly the last thirty seconds before a breach, so even

locally "zero remaining" is not a synonym for "breached".



Ageing `minutesRemaining` rather than recomputing from `dueAt` keeps

everything in one clock domain: the figure the server sent is the

starting point and only the browser's own elapsed time is added, so no

server instant is ever compared against a browser instant. A locally

captured anchor costs network latency — tens of milliseconds against a

figure displayed to the nearest minute — whereas `dataUpdatedAt` costs

correctness, as above.



One timer instead of one per row keeps a twenty-row list at a single

wake-up, and stopping while the tab is hidden means a backgrounded tab

does no work at all. Refetch-on-zero was considered and rejected: it

would fire once per row on a list, and given a payload that is already

at zero but not breached (the `{ AtRisk, 0 }` window above, or a paused

clock frozen at zero) it could re-arm on the refetched payload and loop.



Consequences:



`slaDisplay.ts` is the only place a backend SLA state becomes

user-facing wording, so any future surface must go through it or it will

invent a second vocabulary for the same states. A countdown can sit up

to about thirty seconds behind real time between ticks, and up to a

refetch interval behind the server's own view; this is accepted because

the badge — which is never locally derived — carries the

decision-grade information and the countdown is only an aid. A

countdown's accuracy is bounded in three distinct ways, all accepted:

up to about thirty seconds behind real time between ticks; up to the

query's `staleTime` of ten seconds too generous when a component mounts

against a cache entry that is populated but still fresh, because the

anchor is taken at render rather than at receipt (Decision 2); and,

because refetch-on-focus is disabled project-wide (Decision 5),

arbitrarily far behind the server's own view in a tab left open in the

background until something remounts the query. That last bound is the

sharpest edge of this design: such a tab can show "Due now" beside a

badge that still reads "on track". The badge is the backend's last word

and is never locally derived, so this is stale rather than wrong — but

it is a real limitation, and whether to close it (by enabling focus

refetching for ticket queries, or by a visibility-driven invalidate) is

deferred to the project owner in `TASKS.md`, because either option

changes shared query configuration well beyond this phase's scope. The

ticking figure is

`aria-hidden` and carries no accessible meaning: a number that rewrites

itself every thirty seconds is noise for a screen-reader user, so the

badge text and the absolute `<time>` beside it carry the meaning

instead. The dashboard states plainly that no at-risk total exists

rather than fabricating one, because at risk is a per-ticket fraction of

that ticket's own target and the backend deliberately computes no such

aggregate (ADR-020).



Risks:



The anchor's stability depends on TanStack Query continuing to preserve

object identity for unchanged data through structural sharing. If that

ever changed, every refetch would re-anchor — harmless in itself, since

the anchor would simply move to the newer and equally correct figure —

but the reasoning recorded in `useSlaAnchor` would no longer describe

what happens. The `dataUpdatedAt` hazard is prevented by a regression

test, not by anything mechanical: a future contributor could reintroduce

it by "simplifying" the anchor away, and only that test would catch it.

Frontend and backend share the SLA state vocabulary by convention:

`slaDisplay.ts`'s exhaustive switches make a state the frontend does not

handle a TypeScript error, which is the practical guard, but the union

in `frontend/src/types/api.ts` is a hand-maintained mirror of

`backend/src/sla/sla.constants.ts` and nothing mechanically keeps the

two in step.



\---



\## ADR-022 — Knowledge Base Access Control, Authoring Model and Search



Status: Accepted



Context:



Phase 9 turns the Phase 2 knowledge-base schema (`KnowledgeBaseCategory`,

`KnowledgeBaseArticle`, `KnowledgeBaseArticleFeedback`,

`TicketKnowledgeArticle`) into a working feature: authenticated users read

and search articles, staff write them, readers rate them, and an agent

links an article to the ticket it helped resolve. No migration is added.



Unlike a ticket or an asset, an article has no owner-shaped row scope — an

Employee is not "the requester" of an article — so the access rules, the

authoring rules and the search implementation all had to be decided rather

than copied from ADR-019.



Decisions:



1. Visibility is status-based, and the boundary is a 404. An Employee sees

only `Published` articles; every staff role sees every non-soft-deleted

article in any status. An article outside the caller's scope is `404`,

never `403`, exactly as ADR-019 established for tickets. The reason is

stronger here than tidiness: a draft is unreviewed internal writing, and

its mere existence discloses what support is currently working on.



2. The rule is written once, in two dialects, side by side.

`common/knowledge-article-visibility.ts` exports both a Prisma `where`

fragment and the identical predicate as a `Prisma.Sql`. The second exists

because `search_vector` is an `Unsupported("tsvector")` column that Prisma

cannot query, so the search path must drop to `$queryRaw`. A raw query

whose visibility clause drifts weaker than the ORM path's is the

highest-risk failure mode in this module; keeping both definitions

adjacent is what makes that drift visible in review.



3. Authoring is two-tier: authors versus editors. A SupportAgent may create

articles and edit their own. A TeamLead or Administrator may edit anyone's

article, and is the only role that may change status — publishing is an

editorial act, not an authoring one. An agent editing a colleague's

article gets `403`, not `404`, because they can legitimately read it;

`404` stays reserved strictly for "you cannot see this at all".



4. Status transitions use an explicit matrix, and nothing is terminal.

`ALLOWED_ARTICLE_TRANSITIONS` mirrors the ticket module's style.

`Archived` is the retire path — there is no DELETE endpoint — and an

archived article returns through `Draft`, never straight back to

`Published`, so retired guidance is re-reviewed before it is authoritative

again. Re-submitting the current status is a no-op rather than an error,

because an article PATCH is a whole-form edit and not a single-field

status route.



5. Search is PostgreSQL full-text search, not a search service. A stored

generated `tsvector` column, queried with `websearch_to_tsquery('english',

…)` and ordered by `ts_rank`. Introducing Elasticsearch or Meilisearch for

a corpus of this size would breach ADR-017's infrastructure simplicity.

`websearch_to_tsquery` rather than `to_tsquery` is a correctness

requirement, not a preference: the latter parses its input as an

expression, so an unbalanced quote typed into a search box would surface

as a driver error.



6. Feedback is one vote per user per article, and its raw rows are

staff-only. Submitting again upserts rather than stacking votes, which the

schema's `@@unique([articleId, userId])` enforces. Any user who can see an

article may rate it — rating the guidance you were given is the point —

and gets back only the aggregate counts. The feedback log, which carries

free-text comments and the identity of whoever wrote them, is a separate

staff-only route.



7. Ticket to article links are staff-only, idempotent, and embed only a

summary. Re-linking returns the existing link rather than a 409, and

unlinking twice is still `204`. A link to an article the caller cannot see

is filtered out of the ticket's list — the same shape the ticket-asset

panel already uses.



8. `slug` is display data; `id` is the lookup key. Every route is id-based,

matching every other resource here. Slug generation retries a bounded five

times on collision, because the retry exists to survive two articles

genuinely titled "How to Reset Your Password", not to paper over a broken

slug function.



9. `viewCount` is incremented by a raw, best-effort UPDATE. Prisma writes

`@updatedAt` on every update it issues, so an ORM increment would move

`updated_at` on every read — reordering the list, whose secondary sort key

is `updatedAt`, and firing spurious optimistic-concurrency 409s at anyone

editing the article at the time. Only `Published` articles count views,

and a failed increment never fails the read.



Consequences:



Search relevance is whatever `ts_rank` says: there is no synonym

dictionary, fuzzy matching or typo tolerance, and the dictionary is

hard-coded to `english`. `deletedAt` is honoured on every read but written

by nothing, so soft delete is currently a schema capability with no route

behind it. Categories remain read-only seed data. Because status drives

visibility, an accidental publish is an immediate disclosure to every

Employee — which is precisely why the status transition is restricted to

the editorial roles rather than to whoever wrote the article.
