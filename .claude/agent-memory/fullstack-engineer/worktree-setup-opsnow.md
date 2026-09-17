---
name: worktree-setup-opsnow
description: A fresh OpsNow git worktree has no node_modules and no backend/.env — install both packages, copy .env from the main checkout, and run prisma generate before any test can run
metadata:
  type: project
---

A newly created OpsNow worktree starts with source only. Before any
verification command works:

1. `npm ci` in `frontend/` and in `backend/` (both resolve from the npm
   cache in seconds — no network wait).
2. Copy `backend/.env` from the main checkout (`D:\Projects\OpsNow\backend\.env`).
   It is gitignored, so it does not come with the worktree, and every
   backend test plus `prisma` needs `DATABASE_URL`
   (`postgresql://opsnow@localhost:5432/opsnow_dev`).
3. `npm run prisma:generate` in `backend/`.
4. For Playwright: start `backend` (`npm run start:dev`) first — the
   suite's `global-setup.ts` aborts if `GET /api/v1/health` is not up.
   Playwright starts Vite itself via its `webServer` config.

**Why:** without these, `npm test` fails in a way that looks like a code
problem rather than a missing environment, and it is easy to waste a
cycle debugging the wrong thing.

**How to apply:** do all four as the first action in a fresh worktree,
before writing code, so the verification loop is available from the
start. Never run the seed script to "fix" a database problem — it wipes
data; see [[opsnow-dev-db-is-not-ours-to-reset]].
