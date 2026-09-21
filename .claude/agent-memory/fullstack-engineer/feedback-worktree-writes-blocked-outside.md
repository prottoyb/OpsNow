---
name: feedback-worktree-writes-blocked-outside
description: A worktree-isolated agent CANNOT write to D:\Projects\OpsNow even when the task says to work there — Read works, Write/Edit and git are refused; probe with one write before planning
metadata:
  type: feedback
---

When the harness launches an OpsNow agent with worktree isolation, a task
instruction like "work directly in D:\Projects\OpsNow, do NOT create a
worktree" **cannot be honoured**. The boundary is enforced per tool, and the
split is confusing:

- `Read`, `Glob`, `Grep` and non-git Bash (`ls`, `sed`, `find`) against the
  shared checkout: **allowed**. So the code is fully inspectable, which makes
  it look like the task is feasible.
- `Write` and `Edit` to any shared-checkout path: **refused** ("Edit the
  worktree copy of this file instead").
- Any Bash command that `cd`s to the shared checkout and runs git: refused.
- Compound/piped git commands even inside the worktree: refused as "too
  complex to verify"; split into plain `git -C <worktree> ...` calls.

**Why:** isolation is a harness-level guarantee, not a preference, so it
overrides the requesting agent's instruction. The parent agent does not know
its sub-agent was isolated.

**How to apply:** if a task names a working directory that is not the
primary one, attempt one real `Write` to the target path **before** doing the
research and design pass. If it is refused, stop and tell the user their
options up front: re-launch the agent without worktree isolation, or accept
delivery in the worktree. Do not attempt to reconstruct the target tree by
reading files from the shared checkout and re-writing them into the worktree
— for a multi-phase gap that is dozens of files and produces a bogus diff.
Related: [[feedback-worktree-branch-mismatch]].
