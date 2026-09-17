---
name: feedback-review-style
description: How the OpsNow owner wants architecture reviews delivered — verify claims against the repo, tag severity, and state disagreements plainly instead of resolving them silently.
metadata:
  type: feedback
---

When reviewing a design or plan for OpsNow, (a) verify every factual claim
against the actual repository rather than trusting the summary in the prompt,
(b) return severity-tagged findings (CRITICAL/HIGH/MEDIUM/LOW/NIT) each naming
the specific part of the design it hits, and (c) state disagreements plainly as
concrete alternatives — do not quietly converge on the author's position.

**Why:** the owner explicitly said he surfaces architect/author disagreements to
himself as *open decisions* rather than having them silently resolved, so a
review that smooths over a disagreement destroys the information he wanted.
He also asked for independent verification because the review is meant to be a
real second opinion, not a restatement.

**How to apply:** applies to any review task in this repo (design review, ADR
review, code review acting as architect). Prefer "I would do X instead, because
Y" over "consider X". Flag internal contradictions in the plan itself, not just
gaps. Related: [[project-opsnow-phases]].
