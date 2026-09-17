---
name: feedback-control-chars-in-sources
description: When authoring TS sources/tests containing \uXXXX escapes, verify they stayed as text — the Write tool materialises them as real control bytes, which makes git treat the file as binary.
metadata:
  type: feedback
---

When a source or test file needs a control character (e.g. a NUL-byte
validation test using `'AB\u0000CD'`), check the file afterwards for real
control bytes and convert them back to textual `\uXXXX` escapes.

**Why:** the Write tool interprets `\u0000`/`\x00`-style escapes in file
content and writes the actual byte. Tests still pass, but `git diff` reports
the file as `Bin NNNN -> NNNN bytes` instead of a readable text diff, and the
source is no longer plain ASCII. Hit while implementing OpsNow Phase 8a
review fixes (asset DTO NUL-byte validation).

**How to apply:** after writing any file containing `\u00XX` escapes or a
control-character regex class, run a quick scan (`/[\x00-\x1F]/`) over the
written files and replace any real byte with `'\\u' + code.toString(16)`.
Confirm with `git diff --stat` that the file shows a line count, not `Bin`.
