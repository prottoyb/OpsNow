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

Telling the agent "work directly in the primary working directory, do not
create a worktree" does NOT work either — the harness isolates it anyway.
Plan for adoption from the start.

If the agent stops early (rate limit, error), its work is usually
UNCOMMITTED in its worktree. You do NOT have to copy it out: an engineering-
lead working in the primary checkout can `cd` into the stalled worktree,
verify the work (typecheck), commit it there, and then `git merge --ff-only
<that branch>` in the primary checkout. That preserves authorship and
history and is far less error-prone than copying files across (no CRLF
noise). Do this FIRST, before delegating the remainder — anything left
uncommitted is invisible to the next agent.

**A new agent's worktree is NOT reliably created from current HEAD.** In the
Phases 9–12 milestone every single delegated agent landed on a stale commit
(often several phases behind) and had to run `git merge --ff-only <HEAD>` to
catch up. Always state the expected HEAD sha in the brief and tell the agent
to ff-merge to it if it lands elsewhere — otherwise it will build against
missing files and "recreate" work that already exists.

Corollary: agents branch from stale points, so their branches usually will
NOT fast-forward back into the milestone branch once you have made any
commit of your own. Either merge each agent branch in before committing your
own docs/ADRs, or just accept `--no-ff` merge commits (rebasing is forbidden
by `.claude/rules/git.md`).

**Why:** during Phase 8a I created `.claude/worktrees/phase-8a` and briefed
the fullstack-engineer to use it. The real work landed in the agent's own
worktree instead, leaving two half-set-up worktrees and an empty branch to
reconcile. A later fix-up agent hit the same wall and had to apply edits via
a Node script over Bash to reach the target worktree.

**How to apply:** when delegating phase implementation, expect the diff to
come back in the agent's worktree. Consolidate afterwards by renaming that
branch to the phase's feature branch. Also note a fresh worktree has no
`node_modules` and no `.env` — tell the agent to run `npm ci` +
`npx prisma generate` and copy `backend/.env` in, or its first test run
fails. Reviewers ([[phase-approval-workflow]] gate) can read the branch from
any worktree, so only the implementer's location matters.

**Never let an agent junction/symlink its worktree `node_modules` to the
primary repo's.** In Phase 8b an agent did that to save an install; the later
`git worktree remove --force` followed the junction and emptied the PRIMARY
`frontend/node_modules`, so every gate command failed with "'tsc' is not
recognized" until a reinstall. Brief agents to run `npm ci` in their own
worktree instead.

When adopting a worktree's files by copying, the copies may land with LF
while the working tree is CRLF, so `git status` shows every file modified.
Use `git diff --ignore-cr-at-eol --stat` to find the files with REAL changes
and `git checkout --` the rest, or you will commit formatting-only noise
across untouched files (forbidden by `.claude/rules/git.md`).
