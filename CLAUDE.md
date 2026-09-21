\# OpsNow — Claude Development Instructions



\## Shared AI Software Team Constitution



@D:\Projects\Claude\AI-Software-Team\CLAUDE.md



The shared engineering constitution, mandatory gates, policy precedence,

and agent/rule/skill definitions above are maintained as the single

source of truth at D:\Projects\Claude\AI-Software-Team and made

available here via the symlinked `.claude\agents`, `.claude\rules`, and

`.claude\skills` directories. OpsNow-specific instructions below are

additive and must not contradict it.



\## Project



OpsNow is a professional full-stack IT Service Management platform.



The application will demonstrate modern full-stack engineering practices

through a realistic IT support and service-management workflow.



\## Core Technology



Frontend:

\- React

\- TypeScript

\- Vite



Backend:

\- Node.js

\- NestJS

\- TypeScript



Database:

\- PostgreSQL



Infrastructure:

\- Docker

\- GitHub Actions



Additional technologies may be introduced only when they provide a clear

technical or business benefit.



\## Development Principles



1\. Build incrementally in small, verifiable phases.

2\. Do not implement future phases prematurely.

3\. Prefer simple, maintainable architecture over unnecessary complexity.

4\. Do not rewrite working code without a clear reason.

5\. Do not remove functionality simply to make tests pass.

6\. Never expose secrets, API keys, passwords, tokens, or credentials.

7\. Validate important inputs on the backend.

8\. Security must be enforced on the backend, not only hidden in the frontend.

9\. Write tests for meaningful functionality.

10\. Run relevant tests and checks before marking work complete.



\## Project State



Before starting work:



1\. Read CLAUDE.md.

2\. Read TASKS.md.

3\. Read progress.md.

4\. Read DECISIONS.md.

5\. Run `git status`.

6\. Review recent Git history.

7\. Identify the current development phase.

8\. Identify the first incomplete task.

9\. Inspect the existing implementation before changing it.



Never assume that previous work does not exist.



\## Resume Protocol



This project is designed to survive:



\- Claude usage limits

\- Claude context limits

\- interrupted sessions

\- terminal closure

\- computer restarts

\- agent failures



When resuming work, reconstruct the project state from the repository,

documentation, tests, and Git history rather than relying on previous

conversation context.



Continue from the first incomplete task in TASKS.md.



Do not restart completed phases unless verification shows they are broken.



\## Task Completion



A task must not be considered complete merely because code was written.



Before marking a task complete:



1\. Implement the change.

2\. Run relevant tests.

3\. Run relevant lint/type/build checks.

4\. Verify the implementation.

5\. Update TASKS.md.

6\. Update progress.md.

7\. Commit the completed work to Git.



\## Git Rules



Create meaningful commits at logical checkpoints.



Use clear commit messages such as:



`feat(tickets): add ticket creation`



`fix(auth): handle expired refresh token`



`test(tickets): add ticket service tests`



Do not push to GitHub unless explicitly instructed by the project owner.



Never rewrite Git history unless explicitly instructed.



\## Scope Control



Only work on the task or phase currently requested.



Do not add unnecessary dependencies.



Do not introduce microservices, complex infrastructure, or additional

technologies unless there is a clear reason.



If a requirement is unclear or a significant architectural decision is

required, stop and explain the issue before making a major change.



\## Quality Standard



Code should be:



\- readable

\- maintainable

\- strongly typed

\- appropriately tested

\- secure

\- reasonably documented



The goal is a professional portfolio application that can be explained

clearly in a technical interview.



\## AI Development



AI assistance is allowed and encouraged.



However, generated code must be inspected, tested, and integrated into the

existing architecture.



Do not blindly generate large amounts of code.



Prefer small changes that can be verified independently.



\## Current Status



Phases 0–10 are complete: project foundation, approved architecture (ADR-001

through ADR-024 in `DECISIONS.md`), the Prisma/PostgreSQL database layer, the

NestJS backend foundation, authentication and RBAC, ticket management

(backend API and frontend UI), SLA management (backend API and frontend UI),

asset management (backend API and frontend UI), the knowledge base

(backend API and frontend UI), and dashboard analytics (backend API and

frontend UI).



Phase 11 — Audit Logging is next, followed by Phase 12 — AI Ticket

Assistant, whose architecture is already recorded as ADR-023. See

`TASKS.md` for the current task list and `progress.md` for the full

development log.
