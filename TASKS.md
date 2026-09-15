\# OpsNow Development Tasks



\## Project Status



Status: In Progress



Current Phase: Phase 7 — SLA Management (Phases 6a and 6b — Ticket Management backend API and frontend UI — complete)



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



\# Phase 7 — SLA Management



\- \[ ] Create SLA policies

\- \[ ] Define priority-based SLA rules

\- \[ ] Implement response SLA calculation

\- \[ ] Implement resolution SLA calculation

\- \[ ] Implement SLA countdown

\- \[ ] Implement SLA breach detection

\- \[ ] Implement SLA at-risk status

\- \[ ] Add SLA information to tickets

\- \[ ] Build SLA dashboard metrics

\- \[ ] Add SLA tests



\---



\# Phase 8 — Asset Management



\- \[ ] Create asset types

\- \[ ] Create asset entity

\- \[ ] Create asset service

\- \[ ] Create asset API

\- \[ ] Implement asset assignment

\- \[ ] Implement asset history

\- \[ ] Link assets to tickets

\- \[ ] Build asset list page

\- \[ ] Build asset detail page

\- \[ ] Build asset assignment interface

\- \[ ] Add asset tests



\---



\# Phase 9 — Knowledge Base



\- \[ ] Create knowledge article entity

\- \[ ] Create knowledge categories

\- \[ ] Create article API

\- \[ ] Build article list

\- \[ ] Build article detail page

\- \[ ] Implement article search

\- \[ ] Implement article filtering

\- \[ ] Implement article feedback

\- \[ ] Link knowledge articles to tickets

\- \[ ] Add knowledge base tests



\---



\# Phase 10 — Dashboard \& Analytics



\- \[ ] Create dashboard API

\- \[ ] Calculate ticket metrics

\- \[ ] Calculate SLA metrics

\- \[ ] Calculate resolution metrics

\- \[ ] Calculate category statistics

\- \[ ] Calculate agent performance

\- \[ ] Build management dashboard

\- \[ ] Build ticket analytics

\- \[ ] Build SLA analytics

\- \[ ] Add dashboard filtering

\- \[ ] Add analytics tests



\---



\# Phase 11 — Audit Logging



\- \[ ] Create audit log entity

\- \[ ] Implement audit event service

\- \[ ] Record authentication events

\- \[ ] Record ticket changes

\- \[ ] Record assignment changes

\- \[ ] Record permission-sensitive actions

\- \[ ] Build audit log interface

\- \[ ] Add audit log filtering

\- \[ ] Test audit logging



\---



\# Phase 12 — AI Ticket Assistant



\- \[ ] Define AI use cases

\- \[ ] Design AI service architecture

\- \[ ] Implement secure AI API integration

\- \[ ] Implement ticket analysis

\- \[ ] Implement category suggestion

\- \[ ] Implement priority suggestion

\- \[ ] Implement knowledge article suggestions

\- \[ ] Implement response draft generation

\- \[ ] Implement resolution summary generation

\- \[ ] Handle AI failures safely

\- \[ ] Add AI feature tests



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

