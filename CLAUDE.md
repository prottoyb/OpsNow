\# OpsNow — Claude Development Instructions



\## Shared AI Software Team Constitution



@.claude/framework/CLAUDE.md



The shared engineering constitution, mandatory gates, policy precedence,

and agent/rule/skill definitions above are maintained in a separate

`AI-Software-Team` repository and made available here via local Windows

directory junctions: `.claude\framework` (the repository itself, imported

above), `.claude\agents`, `.claude\rules`, and `.claude\skills`. Run

`.\scripts\setup-ai-team.ps1` to create or repair these on a fresh

checkout — see README.md's "AI-Assisted Development Workflow" section.

OpsNow-specific instructions below are additive and must not contradict it.



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



Phases 0–16 are complete: project foundation, approved architecture (ADR-001

through ADR-027 in `DECISIONS.md`), the Prisma/PostgreSQL database layer, the

NestJS backend foundation, authentication and RBAC, ticket management, SLA

management, asset management, the knowledge base, dashboard analytics, audit

logging and the AI ticket assistant — each with a backend API and a frontend

UI — followed by a cross-cutting testing and quality hardening pass

(Phase 13), containerisation (Phase 14), a GitHub Actions pipeline (Phase 15)

and a documented production deployment posture (Phase 16).



The AI assistant is OFF in a default install. With no `AI_PROVIDER` and no

`AI_API_KEY`, `GET /ai/status` answers `enabled: false` and the ticket page

says the assistant is unavailable — that is the intended out-of-the-box

state (ADR-023), not a broken build. `AI_PROVIDER=mock` demonstrates the

success path without a vendor key, and the UI labels mock output as canned.



The CI pipeline (Phase 15) has run repeatedly on `origin/main` and is

green — GitHub Actions history shows it green on every run since

2026-09-22, including the `docker` job successfully building all three

container images (backend runtime, backend migrator, frontend runtime)

and validating `docker compose config`/`nginx -t` every time. This was

previously described here as "never run" — that had gone stale by the

time it was checked during Phase 17c; it is corrected now rather than

left to be discovered later. What remains genuinely true, and distinct

from the above: Docker itself has never been installed or run on this

authoring machine, so no **local** `docker compose up` has ever happened,

even though CI has proven the images build and the stack's configuration

is valid.



OpsNow is NOT deployed anywhere. There is no hosting account, managed

database, container registry, domain or credential. `docs/deployment.md`

lists the external steps that would be required, and ten of Phase 16's

eleven task-list items are unchecked for exactly that reason. The one that

is checked is "Configure production CORS", whose answer is that production

CORS is deliberately disabled (ADR-027).



Phase 17 — Final Review & Portfolio Preparation is complete for everything

achievable from inside this repository: UI/UX polish (17a/17a-2/17b), and

final review, documentation, verification and release preparation (17c —

security/performance/dependency/environment review, architecture and

database diagrams under `docs/architecture/`, API conventions under

`docs/api/`, a decisions summary at `docs/decisions-summary.md`, and

interview/demo material under `docs/portfolio/`). What remains open needs

something this repository cannot supply on its own: building the

container images on a machine that has Docker, and the external steps in

`docs/deployment.md`. See `TASKS.md` for the current task list and

`progress.md` for the full development log.
