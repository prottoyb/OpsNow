---
name: opsnow-sla-clock-domain-finding
description: MEDIUM finding from Phase 7 SLA review — Ticket.resolvedAt is set from the app clock while every other SLA timing anchor is DB-clock; open as of 2026-09-16
metadata:
  type: project
---

Found during independent QA/security review of Phase 7 (SLA Management),
worktree `agent-a57e68f9c940eddb3`, commits `8297a55..3a446dd` on top of
`bf68d1b`.

**The fact:** `Ticket.createdAt` has a real Postgres `DEFAULT
CURRENT_TIMESTAMP` (confirmed in the migration SQL), so
`SlaService.attachOnCreate`'s use of `ticket.createdAt` is genuinely
DB-clock. But `Ticket.resolvedAt`/`closedAt` have no DB default —
`TicketsService.applyStatusTransition` sets them from `const now = new
Date()` (Node/app-server clock) at
`backend/src/tickets/tickets.service.ts` (the `data.resolvedAt = now`
assignment, introduced in Phase 6a commit `d43789c`, unchanged by Phase
7). `SlaService.recordResolutionOutcome`
(`backend/src/sla/sla.service.ts`) then compares this app-clock
`resolved_at` against a DB-clock-derived `resolution_due_at`, and — more
seriously — `on_hold_started_at` is set equal to this app-clock
`resolved_at` so that a later reopen's `resumeFromPause` computes
`now() - on_hold_started_at` using the *DB's* `now()` against an
*app-clock* anchor.

**Why it matters:** ADR-020 (`DECISIONS.md`) explicitly states every SLA
timing computation must stay "within one clock domain" specifically to
avoid subtle timing corruption — but this one path silently crosses
domains. Under real app/DB clock skew (separate hosts, drifted
container clocks, no enforced NTP), this can produce a wrong persisted
`resolutionBreached` flag (permanent once persisted, per the ADR's own
design — never reconsidered later) or even a negative pause-credit
interval that shrinks a ticket's SLA window instead of only ever
crediting time back. In the current same-host dev/Docker Compose
deployment the skew is near-zero and minutes are rounded, so the tests
pass and the bug is invisible.

**How to apply:** when reviewing a future phase that touches
`resolvedAt`/`closedAt` timing, or if this project moves to a
multi-host deployment, treat this as still-open unless DECISIONS.md
records a fix (e.g., writing `resolvedAt` via a DB-side `now()` raw
statement, or having `recordResolutionOutcome` read back and use only
DB-generated timestamps). Don't assume it was fixed just because later
code doesn't mention it — check `tickets.service.ts`'s `applyStatusTransition`
directly. This was reported as a MEDIUM (not CRITICAL/HIGH) because it
requires actual clock skew to manifest and the current deployment
topology makes that unlikely, not because the underlying design flaw
isn't real.
