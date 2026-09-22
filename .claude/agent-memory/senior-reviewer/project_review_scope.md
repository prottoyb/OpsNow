---
name: project-review-scope
description: OpsNow review scope rule — ADR-001..027 are settled; phases deliberately reuse existing ticket/RBAC patterns, so do not propose new abstractions during review
metadata:
  type: project
---

When reviewing an OpsNow phase, ADR-001 through ADR-027 in `DECISIONS.md` are
settled and approved (ADR-026 auth throttle + proxy trust and ADR-027
deployment posture were accepted in the Phases 13–16 milestone). Phases from 8 onward are deliberately scoped to reuse the
existing ticket/RBAC patterns (visibility helper + `updateMany` CAS +
`{data,total}` envelope + `@Roles` guard plus a service-level re-check) rather
than introduce new machinery.

**Why:** The project owner scopes each phase narrowly on purpose (CLAUDE.md
"Scope Control" and "Prefer simple, maintainable architecture"). Review rounds
that proposed a policy engine, a generic audit table, a new abstraction layer,
or a schema migration were explicitly ruled out of scope before Phase 8a review
began.

**How to apply:** Review the diff for correctness, maintainability and test
quality only. Duplication that mirrors an approved ticket-module pattern is
acceptable reuse, not a finding — flag it only when the duplicated code is
genuinely resource-agnostic AND the extraction is mechanical. Do not re-litigate
settled architecture. Rate findings with the taxonomy in
`.claude/rules/engineering.md`; never invent a scale.

Related: [[project-merge-gate]]
