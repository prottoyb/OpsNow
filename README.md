\# OpsNow



OpsNow is a full-stack IT Service Management platform designed to simulate

a realistic internal IT support environment.



The project demonstrates modern full-stack software engineering practices,

including frontend development, backend API development, relational database

design, authentication, authorization, testing, containerization and CI/CD.



\## Planned Technology Stack



\### Frontend



\- React

\- TypeScript

\- Vite

\- Tailwind CSS



\### Backend



\- Node.js

\- NestJS

\- TypeScript



\### Database



\- PostgreSQL

\- Prisma (ORM and migrations)



\### Infrastructure \& DevOps



\- Docker

\- GitHub Actions



\### Testing



\- Jest \& Supertest (backend unit/integration)

\- Vitest (frontend unit/component)

\- Playwright (end-to-end)



\## Planned Features



\- User authentication

\- Role-based access control

\- IT ticket management

\- Ticket assignment and workflow

\- SLA management

\- IT asset management

\- Knowledge base

\- Management dashboard

\- Analytics

\- Audit logging

\- AI-assisted ticket analysis

\- Automated testing

\- CI/CD

\- Cloud deployment



\## Project Architecture



The application will use a separated frontend and backend architecture.



React will provide the user interface.



NestJS will provide the REST API and business logic.



PostgreSQL will provide persistent relational data storage.



\## Development Approach



OpsNow is being developed incrementally using AI-assisted software

development.



AI agents may assist with implementation, testing, documentation and

review. All generated work is expected to be tested and reviewed before

being considered complete.



Project state is maintained in:



\- `CLAUDE.md`

\- `TASKS.md`

\- `progress.md`

\- `DECISIONS.md`

\- Git history



This allows development to continue safely across different AI sessions,

usage limits and interruptions.



\## Project Status



Phases 0–7b are complete: project foundation, approved architecture

(ADR-001 through ADR-021 in `DECISIONS.md`), the Prisma/PostgreSQL database

layer, the NestJS backend foundation, authentication, authorization/RBAC,

the ticket management REST API and frontend UI, and SLA management — the

backend SLA engine and staff-only policy/metrics endpoints (Phase 7a) plus

the SLA frontend: per-ticket SLA state on the ticket detail page, an SLA

indicator in the ticket list, and a staff-only SLA dashboard (Phase 7b).



Development is currently entering Phase 8 — Asset Management.



\## Running Locally



Prerequisites: Node.js 22+, a local PostgreSQL instance, and an

`opsnow_dev` database. Copy `backend/.env.example` to `backend/.env` and

fill in real local values.



Backend (http://localhost:3000, API under `/api/v1`, Swagger at

`/api/docs`):



```

cd backend

npm install

npx prisma migrate deploy

npm run prisma:seed      # WARNING: wipes and rebuilds all data

npm run start:dev

```



Frontend (http://localhost:5173):



```

cd frontend

npm install

npm run dev

```



The frontend talks to the API through a Vite proxy, and must — the backend

enables no CORS, rejects a cross-origin refresh/logout, and issues a

`SameSite=Strict` refresh cookie, so the API has to appear on the app's own

origin. Run the frontend through Vite rather than opening `dist/` directly.



\## Testing



```

cd backend  && npm test && npm run test:e2e   # Jest + Supertest

cd frontend && npm test                        # Vitest + Testing Library

cd frontend && npx playwright test             # end-to-end

```



The backend e2e and Playwright suites run against the real local database.

They create only data they tag, assert only on that data, and clean up only

what they created — neither resets the database, so local development data

survives a test run.



`[E2E]` is a reserved ticket-subject prefix: the Playwright teardown deletes

every ticket whose subject starts with it. Do not use it for real tickets.



\## License



This project is intended as a portfolio project.

