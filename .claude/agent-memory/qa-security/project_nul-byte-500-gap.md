---
name: nul-byte-500-gap
description: Project-wide gap — no DTO rejects U+0000 in text fields, so any string body field reaches Postgres and returns an unhandled 500
metadata:
  type: project
---

No DTO or shared transform in the OpsNow backend strips or rejects the NUL
character (`\u0000`) in string input. `common/transforms/trim.transform.ts`
only trims. Postgres rejects `0x00` in text with SQLSTATE 22021, which Prisma
surfaces as `PrismaClientUnknownRequestError` — a code that no service's
`mapPrismaError` handles — so the request becomes a 500.

Verified empirically on Phase 8a `POST /api/v1/assets` (assetTag and notes
both reproduce it). The pattern is identical in the tickets DTOs, so it is
systemic rather than introduced by any one phase.

**Why:** it silently defeats the "no raw DB error reaches a client" claim
each service makes, and `mapPrismaError` only covers P2002/P2003/P2025.

**How to apply:** when reviewing any new write endpoint, treat a raw-500
probe with `\u0000` as a standard check, and prefer a shared sanitizing
transform over per-service error mapping when recommending the fix.
