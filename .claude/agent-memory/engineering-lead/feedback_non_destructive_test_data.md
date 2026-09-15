---
name: non-destructive-test-data
description: Test suites must never reset/wipe the shared dev database; create tagged data, assert only on it, clean up only what the run created
metadata:
  type: feedback
---

Automated test suites in OpsNow must never reset, reseed, or wipe the local
development database. Instead: create data with a unique run-scoped marker,
assert only against data the run itself created, clean up only those records,
and leave all other seeded/developer data untouched. Cleanup should run even
after failures (best-effort teardown), and should verify preconditions rather
than repair them — if the DB isn't seeded, abort with an actionable message
telling the developer to run the seed themselves.

**Why:** During Phase 6b planning I proposed running `prisma:seed` (whose
`resetData()` deletes every table including users and refresh tokens) as a
Playwright prerequisite. The project owner rejected this outright and required
the strategy above, explicitly matching the philosophy already used by the
Phase 6a backend e2e tests, which track created ticket ids and delete only
those in `afterAll`. The owner cared that a developer's own data and live
session survive a test run.

**How to apply:** Any time a test needs data it doesn't have, reach for
tagged-create + scoped-cleanup, not a reset — and check whether cascade
deletes let one scoped `deleteMany` do the whole job. If isolated cleanup
genuinely isn't achievable, stop and report that as a blocker rather than
falling back to a destructive reset. Guard any destructive cleanup script so
it fails closed unless it is pointed at a local database.

Related: [[phase-approval-workflow]]
