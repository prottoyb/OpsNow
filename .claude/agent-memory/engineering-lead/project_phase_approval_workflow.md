---
name: phase-approval-workflow
description: Owner reviews a written plan and approves/rejects it decision-by-decision (D1, D2...) before any implementation begins
metadata:
  type: project
---

The project owner works plan-first: for a significant phase, engineering-lead
produces a full written plan ending in a numbered list of "decisions requiring
approval" (D1, D2, D3...). The owner then responds to each one individually —
approving, rejecting, deferring, or approving-with-a-change — and only then
green-lights implementation. Phase 6b ran exactly this way and the owner
rejected one decision (D5) and modified another (D4) rather than accepting the
plan wholesale.

**Why:** The owner wants genuine decision points surfaced explicitly rather
than an agent quietly choosing for them, and treats plan approval and
implementation approval as separate steps. Bundling decisions into prose, or
presenting a single take-it-or-leave-it recommendation, removes their ability
to steer.

**How to apply:** Always end a phase plan with an explicit numbered decisions
section, including any point where agents disagreed (surface both views rather
than silently picking one), any backend/contract change that would be needed,
and any standing exception rule. Never treat plan approval as approval to
merge, push, or change governance. Expect to revise and re-present the plan
before starting work.

Related: [[non-destructive-test-data]]
