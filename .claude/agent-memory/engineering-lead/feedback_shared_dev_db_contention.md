---
name: shared-dev-db-contention
description: Never let two agents run the backend e2e suite at once — the suites share one dev database and some assert on aggregate deltas.
metadata:
  type: feedback
---

Only ever let ONE agent execute the backend e2e suite at a time. When
parallelising a QA pass and a senior review, give execution to QA and
restrict the reviewer to static analysis (`typecheck`/`lint`/`build` are
safe; `npm test`/`npm run test:e2e` are not).

**Why:** every backend e2e suite runs against the same local development
PostgreSQL instance, and some assertions are not hermetic — the Phase 10
analytics at-risk test asserts that an aggregate *moved by exactly one*
after it drives a ticket's SLA row. A second suite creating or resolving
tickets concurrently makes that assertion flap, and the resulting failure
looks like a real defect in the code under review rather than contention.

**How to apply:** when launching agents in parallel, decide up front which
one owns the database and say so explicitly in both briefs — tell the
excluded agent *why*, or it will helpfully run the suite anyway to "verify".
Parallelism is still safe and worthwhile when the agents' trees are
disjoint (e.g. a frontend feature and a backend feature); it is only
concurrent *execution* against the DB that must be serialised.

**Port 3000 is shared the same way.** Another session may already have a
backend listening there, so `node dist/main` fails with `EADDRINUSE` while
`/api/v1/health` answers fine — a confusing pair of signals. Check
`netstat -ano | grep :3000` and `Get-CimInstance Win32_Process -Filter
"ProcessId = <pid>"` before concluding anything, and do NOT kill a process
another session owns. Playwright only needs *an* API on :3000 with a raised
`AUTH_THROTTLE_LIMIT`; if one is already up and its throttle is high
enough, just run the suite against it (this worked at the 2026-09-22
milestone close — 11/11 passed).

Related: [[non-destructive-test-data]] (never reset the DB) and
[[subagent-worktree-isolation]] (each agent needs its own `npm ci` and a
copied `backend/.env` before it can run anything at all).
