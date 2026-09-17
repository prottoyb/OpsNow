---
name: project-docs-escaped-markdown
description: OpsNow's DECISIONS.md/TASKS.md/progress.md/README.md use doubled newlines and backslash-escaped markdown, with inconsistent line endings per file — edit them programmatically, not by hand
metadata:
  type: project
---

OpsNow's four root documentation files are stored with **every newline
doubled** (one blank line between consecutive lines of a paragraph, three
between paragraphs) and with markdown syntax backslash-escaped (`\##`,
`\-`, `\[x]`). Line endings differ per file and must be preserved:
`progress.md`, `TASKS.md` and `README.md` are CRLF; `DECISIONS.md` is LF
(git is configured to normalise to CRLF on checkout, so a diff against it
still shows clean).

**Why:** the files were originally authored through a tool that escaped
and double-spaced them, and the whole history is in that style. Matching
it exactly is what keeps a docs diff additive instead of a whole-file
rewrite that buries the actual change.

**How to apply:** write the new section as normal markdown in a scratchpad
file, then append/splice it with a script that does
`text.replace('\n', NL + NL)` using that file's own newline sequence, and
open with `newline=''` so Python does not translate endings. Verify
afterwards with a CRLF/bare-LF byte count and `git diff --stat` — the
deletion count should be ~0 for a pure append. Editing these files with
the plain Edit tool works only for single-line replacements with no
newlines in them.
