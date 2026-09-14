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

