---
name: feedback-worktree-branch-mismatch
description: An OpsNow agent worktree's branch can be many commits BEHIND the branch the task names; verify with git log before coding, and check EARLY whether the repair (ff-merge / checkout -- paths) is even permitted
metadata:
  type: feedback
---

An agent worktree (`worktree-agent-<id>`) is routinely checked out at a
commit *before* the work a briefing calls "already committed". Seen twice:
once one commit behind, once **52 commits** behind (worktree at Phase 8b
while the task targeted Phase 12 — `backend/src/ai/`,
`features/knowledge-base`, `features/audit` and `features/analytics` simply
did not exist).

**Why:** the briefing describes what the coordinating agent believes, not
what this worktree's branch points at. Worktrees are created at arbitrary
points and briefings drift from literal git state.

**How to apply:** before writing any code on a task that says prior work is
"already committed/present", run these three checks, in this order:

1. `git -C <worktree> log --oneline -3` and confirm the named work is there.
   Faster still: `ls` one file the task depends on.
2. If behind, check it is a clean fast-forward:
   `git -C <worktree> merge-base --is-ancestor HEAD <sha>` and
   `git -C <worktree> rev-list --count HEAD..<sha>`.
3. **Immediately try the repair and see if it is allowed** — do not design
   the solution first. Both `git merge --ff-only <sha>` and
   `git checkout <sha> -- <paths>` are frequently DENIED by the permission
   classifier ("Modify Shared Resources" / "Irreversible Local Destruction").

If the repair is denied, the task cannot proceed in the worktree: stop and
ask the user to either run the fast-forward themselves or re-launch the
agent without worktree isolation. Doing the reading and design first and
only then discovering the block wastes most of the turn. See
[[feedback-worktree-writes-blocked-outside]].
