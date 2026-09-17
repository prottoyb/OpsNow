---
name: opsnow-dev-db-is-not-ours-to-reset
description: The opsnow_dev database is shared developer state — never seed, reset or wipe it; verify seed counts before and after every test run instead
metadata:
  type: feedback
---

Never run `prisma:seed`, `migrate reset`, or any wipe against the local
`opsnow_dev` database, and never add a test hook that does. Test suites
create only tagged (`[E2E]`-prefixed) data and clean up exactly that.

**Why:** the seed script deletes existing data, and the developer's
database holds tickets and state the test run does not own.
`e2e/global-setup.ts` is written to *verify* preconditions and abort with
instructions rather than fix them itself — that decision was deliberately
taken away from automation, and every phase since has been asked to
confirm seed data is unchanged.

**How to apply:** capture counts (tickets, sla_policies, users,
ticket_sla, ticket_comments) before and after any run that touches the
database, and report both. As of Phase 7b the seeded baseline is
5 tickets / 4 SLA policies / 7 users / 5 ticket SLA rows / 3 comments. If
preconditions are missing, report it and let the human run the seed
deliberately. See [[worktree-setup-opsnow]] for how to reach the database
from a worktree.
