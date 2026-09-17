---
name: opsnow-cas-pattern
description: OpsNow TicketsService's optimistic-concurrency (CAS) convention for status/priority/assignment mutations, and how to verify it actually holds
metadata:
  type: project
---

`backend/src/tickets/tickets.service.ts` uses one recurring CAS shape for
every mutation that must not double-apply under a race (assign, status
transition, priority change — see ADR-019, extended by ADR-020 for
priority): read the ticket, then inside a `$transaction`, run

```
tx.ticket.updateMany({ where: { id, <field>: <value just read>, ...ticketVisibilityWhere(user) }, data: {...} })
```

and throw `ConflictException` (409) unless `updated.count === 1`. Any
dependent side-effect (SLA delta, history row) runs strictly *after* that
check, inside the same transaction.

**Why this actually works:** Postgres READ COMMITTED re-evaluates an
UPDATE's WHERE clause against the row's current committed state when it
gets the row lock (EvalPlanQual), so a second concurrent transaction whose
WHERE was satisfied at read time but not by the time it acquires the lock
will match zero rows, not silently overwrite. This is a genuine guarantee,
not just a test artifact — verified by reading the transaction/isolation
code, not by trusting the code comments' own claims.

**How to apply:** when reviewing a new mutation that claims this same CAS
protection, check (1) the `where` includes the field whose staleness
matters, (2) `count !== 1` throws before any dependent write, (3) the
dependent write reads its own inputs from the DB row inside its own
statement rather than from an application-level variable captured before
the transaction (see [[opsnow-sla-clock-domain-finding]] for a case where
that last part was violated for a *timestamp's origin*, not the CAS
itself). A real concurrency test fires two actual concurrent HTTP requests
(e.g. `Promise.all([...])` against a running Nest app in an e2e spec) and
asserts exactly one 200 + one 409, plus that the final persisted state
matches only the winner — that pattern is trustworthy; a unit test that
only mocks Prisma calls cannot prove the race-safety property itself
(it can only prove call ordering).
