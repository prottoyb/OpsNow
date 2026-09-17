---
name: project-opsnow-phases
description: OpsNow runs a strict phase gate — Phase 7 (SLA) is scoped to exactly TASKS.md's Phase 7 list, and backend/frontend are split into Na/Nb sub-phases.
metadata:
  type: project
---

OpsNow is delivered as numbered phases whose scope is defined *exactly* by the
bullet list under that phase heading in `TASKS.md`. Nothing from a later phase
may be pulled forward. Phase 6 was split into 6a (backend API) and 6b
(frontend UI) as separate commits/deliverables; the owner treats that split as
the reusable precedent for later phases.

As of 2026-09-16: Phases 0-7a complete and merged (7a = SLA backend, ADR-020).
Phase 7b (SLA frontend UI) is in design review, not yet implemented. Its
TASKS.md block is four items, and the staff-only SLA dashboard consuming
`GET /sla/metrics` + `GET /sla-policies` genuinely belongs to 7b, not Phase 10
— only SLA *analytics beyond those narrow metrics* is deferred.

**Why:** the project is a portfolio application meant to demonstrate
incremental, verifiable engineering, and CLAUDE.md's Scope Control forbids
premature implementation of future phases. AuditLog/generic audit logging is
Phase 11's; SLA *analytics* and dashboards are Phase 10's; Phase 7 only owns
SLA calculation, breach/at-risk state, and narrow dashboard metrics.

**How to apply:** when asked to design or review work, first read the relevant
`TASKS.md` phase block and treat it as the scope contract. Propose an optional
`Nb` sub-phase rather than silently including frontend work in a backend phase.
Major decisions go in `DECISIONS.md` as a numbered ADR (ADR-019 is the latest
as of this writing). Related: [[feedback-review-style]].
