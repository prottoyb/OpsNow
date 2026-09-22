# Interview Preparation

Talking points for discussing OpsNow in an interview, written to be
accurate to the actual repository state — nothing here claims more than
what `TASKS.md`, `progress.md` and `DECISIONS.md` can back up.

## 60-second explanation

"OpsNow is a full-stack IT service management platform I built to
demonstrate production-quality engineering practice, not just feature
breadth. It's a React SPA talking to a versioned NestJS REST API backed
by PostgreSQL — tickets, SLA tracking, asset management, a knowledge base,
analytics, and an audit log, plus an optional AI assistant for ticket
triage. The things I'd actually want to talk about are underneath the
feature list: every role-based access rule is enforced on the backend,
not just hidden in the UI; ticket and asset assignment use optimistic
concurrency so two people acting on the same record can't silently
overwrite each other; and every phase went through independent
QA/security and code review before I considered it done. It's built
incrementally — about twenty phases, each with its own tests and its own
architecture decision records — and it's honest about what's not there:
it's never been deployed anywhere, and I can explain exactly why and what
it would take."

## 2–3 minute technical explanation

Start from the shape: two-tier web app, React SPA + NestJS REST API + a
single PostgreSQL database, no microservices, no message queue. That's a
deliberate scope decision (ADR-001/017), not a limitation — the
complexity budget went into correctness inside each layer instead.

Then walk the request path: every request passes a global validation
pipe, a default-deny auth guard, a role guard, and — inside the relevant
service — a row-level visibility check that decides *which* rows a caller
can see, independent of whether their role can call the route at all.
That two-layer model (RBAC, then row visibility) is worth being explicit
about, because it's the thing that actually stops an Employee from
reading someone else's ticket even though `Employee` is allowed to call
`GET /tickets/:id`.

Then pick one concrete mechanism to go deep on — the SLA pause/resume
math or the concurrency model both work well (see below) — and describe
the failure mode it prevents, not just what it does.

Close with the process: every phase had a plan, an implementation, an
independent security review and a separate code review, with findings
fixed or explicitly deferred and tracked — not because it's a template to
follow, but because it's *why* the concurrency and auth claims above are
something you verified caught real bugs, not something you're asserting
from memory of writing the code.

## Architecture walkthrough

1. **Client**: React SPA (Vite, TanStack Query, React Router). Auth state
   — the access token — lives in memory only, never in storage.
2. **Same-origin edge**: Vite's dev proxy locally, nginx in a container.
   Not a convenience — the refresh cookie is `SameSite=Strict`, so the
   browser has to see the API as same-origin or authentication simply
   doesn't work.
3. **API**: NestJS, one module per resource, global guards/pipes/filter
   applied uniformly rather than per-route.
4. **Data**: Prisma over PostgreSQL, UUID keys, hand-added CHECK
   constraints and partial unique indexes for the invariants Prisma can't
   express declaratively.
5. **Optional AI boundary**: a provider-abstracted assistant module, off
   by default, that can suggest but never directly mutate a ticket.

See `docs/architecture/system-architecture.md` for the diagram this
maps to.

## One difficult engineering problem, and how it was solved

**SLA pause/resume under a real concurrency review finding.** Every
ticket has two independent SLA clocks (response, resolution). Putting a
ticket `OnHold` has to pause both without losing the notion of "how much
time was actually available." The first design compared a response's
timestamp against the (still-unshifted) due date to decide breach — and
independent review caught that this could **permanently mis-record a
genuinely on-time response as a breach** if the reply landed while the
ticket was paused, because the due date hadn't been shifted yet at that
instant. The fix reframes the question: judge breach from whether the
*pause itself* started after the due date had already passed, not from
the reply's own timing relative to a due date that hasn't caught up yet.
That's the kind of bug that a unit test asserting "pausing extends the
due date" would never catch, because the test and the code shared the
same wrong mental model — it took an independent reviewer working from
the invariant ("was this actually late, in real time"), not from the
implementation, to find it. Full account in the Phase 7a entry of
`progress.md` and in ADR-020's Risks section.

## Auth/security explanation

- Argon2id password hashing; refresh tokens are opaque, SHA-256 hashed
  before storage, and only ever leave the server in an `httpOnly`,
  `SameSite=Strict` cookie.
- Refresh rotation is atomic and single-use: reusing an already-rotated
  token is treated as theft and revokes the entire token family. That
  made the frontend's refresh-on-401 logic genuinely harder — it has to
  be single-flight *and* serialized across browser tabs via
  `navigator.locks`, because two tabs racing a refresh is exactly the
  "stale but real" presentation this mechanism is designed to react to.
- Default-deny routing (every route requires auth unless explicitly
  marked public) means a forgotten guard fails closed, not open.
- Rate limiting on the three credential endpoints, each with its own
  counter, keyed through a configurable trusted-proxy-hop count so
  `req.ip` can't be trivially forged from behind a real reverse proxy.
- Known, documented gaps I'd bring up unprompted if asked "what would you
  improve": the auth throttle counter is per-process (multiplies with
  replica count), a blocked (429) request writes no audit row, and there's
  no request-correlation ID in the logs.

## Concurrency example

Ticket assignment and status transitions (and asset assignment,
separately) use optimistic concurrency: read the row, then write with a
conditional `updateMany` gated on the state as last read. If someone else
changed the row in between, the write affects zero rows and the caller
gets a clean `409 Conflict` — never a silent overwrite, never a torn
write. I didn't just unit-test this by mocking a zero-row update; I fired
genuinely concurrent requests at a real running server and confirmed
exactly one request won and the history ledger's row count matched the
success count exactly.

## SLA design explanation

Each ticket snapshots its SLA policy (response/resolution minute targets)
at creation time, so a later policy edit never rewrites an in-flight
ticket's targets. Pausing (`OnHold`) shifts both due dates forward by the
paused duration on resume, rather than tracking "elapsed active time"
separately — simpler arithmetic, same result. Reopening a resolved ticket
reuses the identical pause-credit mechanism, anchored to the **database's**
clock rather than the application's, specifically to avoid clock-skew
corrupting the credited time. The frontend never re-derives any of this —
`responseState`/`resolutionState` are backend-authoritative strings; the
UI only ages the backend's own `minutesRemaining` figure locally between
polls, so a badge is never wrong in a way the backend wasn't already wrong.

## Testing strategy

Backend: Jest unit tests for services/guards/pure logic, plus a Supertest
e2e suite run against a real local PostgreSQL database (not mocks),
covering the full role grid per endpoint. Frontend: Vitest/Testing
Library, plus a repository-wide guard suite that fails the build on
`dangerouslySetInnerHTML`, `eval`, string-form timers, or any use of web
storage. End-to-end: Playwright against the real running stack. Every
e2e/Playwright suite tags the data it creates and cleans up only what it
tagged, so a crashed run self-heals on the next one instead of requiring
a manual database reset. Concurrency claims are backed by genuinely
concurrent requests against a real server, not only deterministic mocks.
Exact current counts are in `TASKS.md`'s Phase 13 entry and the CI
workflow — worth citing a number if asked, but say "as of the last full
run" rather than memorizing it as permanent.

## AI assistant design

Off by default — no environment variable means the feature is fully
absent, not degraded, which is the honest default for a portfolio project
with no vendor key to ship. Three interchangeable providers behind one
interface (`disabled`, `mock` for demoing the success path without a real
key, `anthropic` for the real thing), so application code never branches
on which is active. The most important property: nothing it produces can
change a ticket by itself. A suggestion is applied only by a second,
explicit click that goes through the same `PATCH /tickets/:id` mutation a
human-typed change would use — same validation, same history write, same
403/409 handling. That's the actual answer to "how do you make an AI
feature safe": not by trusting the model's output, but by never letting
it hold a write credential of its own.

## Trade-offs and deferred work

Be ready to name a few honestly rather than implying everything is done:

- No staff-visible user directory (`GET /users` is Administrator-only),
  so assignment UIs across tickets/assets/dashboards are limited to
  "assign to me" style actions rather than a picker. Same root cause,
  deferred consistently rather than solved differently three times.
- Resolution-time analytics don't subtract paused time, so a ticket
  parked awaiting a reply reports a longer resolution time than the work
  actually took.
- The container images have never been built *locally* — no Docker on the
  authoring machine — though CI has built them successfully on every
  green run since 2026-09-22, which is real (if remote) evidence they
  work. Say so plainly if asked, including the distinction between
  "CI has proven it" and "I've run it myself" — that's a stronger,
  more precise answer than either overclaiming or underclaiming it.
- The project has never been deployed. That's a resourcing fact (no
  hosting account, no card on file), not an engineering gap — the
  deployment posture, environment validation, and the external-steps
  checklist are all written (`docs/deployment.md`, ADR-027).

## What I would improve next

In priority order if this became a real system: (1) the staff-directory
endpoint, since it's the single root cause behind several deferred UI
limitations; (2) shared/distributed state for the auth throttle and the
AI concurrency cap, since both are currently per-process and would
under-protect behind more than one replica; (3) an outbox pattern for
audit writes, since a write is currently best-effort after the primary
transaction commits; (4) actually running it — building the images,
running CI, and working through the external deployment steps.
