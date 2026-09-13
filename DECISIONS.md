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



Status: Planned



Decision:



OpsNow will use token-based authentication with short-lived access tokens

and refresh tokens.



Reason:



The application requires authenticated users and protected API resources.

The implementation must provide secure authentication while keeping the

frontend and backend responsibilities clearly separated.



\---



\## ADR-006 — Authorization



Status: Planned



Decision:



OpsNow will implement backend-enforced role-based access control (RBAC).



Initial roles:



\- Employee

\- Support Agent

\- Team Lead

\- Administrator



Reason:



Different users require different levels of access. Authorization must be

enforced by the backend rather than relying only on frontend visibility.



\---



\## ADR-007 — API Style



Status: Accepted



Decision:



Use RESTful HTTP APIs for communication between the React frontend and

NestJS backend.



Reason:



REST provides a clear and widely understood interface for this application

and is appropriate for demonstrating full-stack API development.



\---



\## ADR-008 — Testing



Status: Accepted



Decision:



Use automated testing at multiple levels.



Planned tools:



\- Vitest for unit testing

\- Supertest for backend API/integration testing

\- Playwright for end-to-end testing



Reason:



The project should demonstrate that features are verified rather than only

implemented.



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

