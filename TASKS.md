\# OpsNow Development Tasks



\## Project Status



Status: In Progress



Current Phase: Phase 6 — Ticket Management (Phase 5 — Authorization & RBAC complete)



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



\# Phase 6 — Ticket Management



\- \[ ] Create ticket entity

\- \[ ] Create ticket repository

\- \[ ] Create ticket service

\- \[ ] Create ticket controller

\- \[ ] Add ticket validation

\- \[ ] Create ticket creation API

\- \[ ] Create ticket retrieval API

\- \[ ] Create ticket update API

\- \[ ] Implement ticket assignment

\- \[ ] Implement ticket status management

\- \[ ] Implement ticket priority management

\- \[ ] Implement ticket categories

\- \[ ] Implement ticket comments

\- \[ ] Implement internal notes

\- \[ ] Implement ticket history

\- \[ ] Add ticket backend tests

\- \[ ] Build ticket list page

\- \[ ] Build ticket creation page

\- \[ ] Build ticket detail page

\- \[ ] Connect frontend to backend

\- \[ ] Test complete ticket workflow



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

