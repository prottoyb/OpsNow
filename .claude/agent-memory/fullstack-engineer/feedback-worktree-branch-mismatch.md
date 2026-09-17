---
name: feedback-worktree-branch-mismatch
description: A freshly created OpsNow worktree's own branch can be based on a commit BEFORE the "already committed" prior work the task description names — verify with git log/merge-base before assuming it's present
metadata:
  type: feedback
---

A task briefing said prior work was "COMMITTED as `<sha>` on branch
`feature/phase-8b-asset-frontend` and is already present in your working
tree," but the worktree's own branch (`worktree-agent-<id>`) was actually
checked out one commit *before* that commit — the files were simply not
there. `git log --oneline -5` plus `git branch -a -v` caught this
immediately.

**Why:** the coordinating agent's briefing describes what it believes is
true, not necessarily what this worktree's branch actually points at.
Worktrees are created at various points and a task description carrying
forward from an earlier planning step can drift from the literal git state.

**How to apply:** at the start of any task that says "prior work is already
committed/present," run `git log --oneline -5` and compare against the named
sha/branch before writing code. If the branch is missing it and the sha is a
descendant of HEAD (check with `git merge-base HEAD <sha>` — if it equals
HEAD, it's a clean fast-forward), pull just those paths into the working
tree with `git checkout <sha> -- <paths>` (this stages the files without
moving HEAD or creating a commit) rather than merging/cherry-picking, which
would create a commit the instructions may have forbidden. Verify
`npm run typecheck` still passes on the combined state before proceeding.
