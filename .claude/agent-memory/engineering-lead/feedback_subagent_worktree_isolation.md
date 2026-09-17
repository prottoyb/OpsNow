---
name: subagent-worktree-isolation
description: Delegated agents get their own auto-created worktree and cannot write to a worktree path you assign them, so plan phase branches around that.
metadata:
  type: feedback
---

Do not pre-create a worktree and tell a subagent to work in it. The harness
isolates each delegated agent to its own auto-created worktree
(`.claude/worktrees/agent-<id>`), and its Write/Edit tools refuse paths
outside that. Instead, let the agent work wherever it lands, then adopt its
worktree: `git branch -m <feature-branch>` in place, and delete the empty
worktree you created.

**Why:** during Phase 8a I created `.claude/worktrees/phase-8a` and briefed
the fullstack-engineer to use it. The real work landed in the agent's own
worktree instead, leaving two half-set-up worktrees and an empty branch to
reconcile. A later fix-up agent hit the same wall and had to apply edits via
a Node script over Bash to reach the target worktree.

**How to apply:** when delegating phase implementation, expect the diff to
come back in the agent's worktree. Consolidate afterwards by renaming that
branch to the phase's feature branch. Also note a fresh worktree has no
`node_modules` and no `.env` — run `npm ci` + `npx prisma generate` and copy
`backend/.env` in before the agent needs to run tests, or its first test run
fails. Reviewers ([[phase-approval-workflow]] gate) can read the branch from
any worktree, so only the implementer's location matters.
