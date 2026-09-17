---
name: opsnow-repo-layout
description: How OpsNow's shared constitution files are wired via symlinks, and how that looks inside a git worktree
metadata:
  type: project
---

OpsNow's `.claude/agents`, `.claude/rules`, and `.claude/skills` are
symlinks to `D:\Projects\Claude\AI-Software-Team\.claude\...` (the shared
AI-Software-Team constitution repo), per OpsNow's CLAUDE.md.

**Why:** the constitution (engineering.md, security.md, testing.md,
frontend.md, backend.md, database.md, git.md) is maintained once and
shared across multiple projects, not duplicated per-repo.

**How to apply:** inside a git worktree (e.g.
`D:\Projects\OpsNow\.claude\worktrees\<name>`), these symlinks often show
up as plain 1-line text files containing the target path (Windows/git
worktree symlink quirk) rather than resolving as directories — `ls` on
`.claude/rules` fails with "Not a directory". Read the file with the Read
tool to get the real target path, then read rule files directly from
`D:\Projects\Claude\AI-Software-Team\.claude\rules\<file>.md`. Don't waste
time trying to `cd` into or `ls` the symlink path itself.

Severity taxonomy (CRITICAL/HIGH/MEDIUM/LOW/OPTIONAL) and the Reviewer
Disagreement process live in `engineering.md` in that shared repo, not in
OpsNow's own files — always pull the current definitions from there
rather than relying on memory of past wording.
