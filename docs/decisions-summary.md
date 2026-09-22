# Engineering Decisions — Summary

`DECISIONS.md` holds the full Architecture Decision Records (ADR-001
through ADR-027), each with its own context, alternatives considered, and
consequences. This document is a faster way in: the trade-off behind each
major decision, in one or two sentences, with a pointer to the full ADR.
It does not replace `DECISIONS.md` and no new ADRs were written for it.

## Application shape

- **SPA + REST, not server-rendered, not GraphQL, not microservices**
  (ADR-001/002/003/007). A single React SPA calling one versioned NestJS
  REST API keeps the complexity budget on correctness inside each layer —
  access control, concurrency, SLA math — rather than on distributed-systems
  concerns a project at this scale doesn't need.
- **No monorepo tooling, no message queue, no permissions table, no state
  library** (ADR-017). Several ADRs explicitly record a more complex
  option that was considered and rejected as premature rather than simply
  not discussed.

## Data layer

- **Prisma is the schema and migration source of truth** (ADR-014).
  `schema.prisma` is hand-edited, migrations are generated and reviewed,
  and Postgres-specific constructs Prisma can't express (CHECK constraints,
  partial unique indexes, the generated `tsvector` search column) are added
  by hand to the migration SQL rather than worked around in application code.
- **UUID primary keys throughout** (ADR-015), except `Ticket.ticketNumber`
  (a human-facing autoincrement integer, since "ticket #4821" is what a
  person actually says out loud) and the two composite-key link tables.
- **PostgreSQL full-text search, not a search service** (ADR-022, and
  ADR-017's simplicity principle). A generated `tsvector` column with a GIN
  index and `ts_rank` handles knowledge-base search entirely inside
  Postgres — no Elasticsearch, no synonym dictionary, no fuzzy matching.
  Explicitly the right call at this corpus size, explicitly revisitable if
  the corpus grows.

## Authentication and authorization

- **Default-deny route protection** (ADR-018): every route requires a
  valid access token unless explicitly marked `@Public()`, enforced by a
  globally-registered guard. A per-route opt-in guard can be forgotten and
  fails open; a global default-deny guard cannot silently skip a new route.
- **RBAC as a fixed enum, not a dynamic permissions table** (ADR-006).
  Four roles (`Employee`, `SupportAgent`, `TeamLead`, `Administrator`)
  cover every access decision the application currently needs; a
  permissions table was deliberately deferred until there's a concrete
  need finer-grained roles would actually solve.
- **Refresh tokens rotate on every use, with theft detection** (ADR-005).
  Presenting an already-rotated token revokes the entire token family, not
  just that token — the cost is that two tabs racing a refresh is a real
  failure mode the frontend has to serialize against, not a theoretical one.
- **Auth endpoint rate limiting, keyed on a configurable proxy hop count**
  (ADR-026). `/auth/login`, `/auth/register`, `/auth/refresh` each get
  their own throttle counter; `TRUST_PROXY_HOPS` decides what `req.ip`
  means for both the throttle and the audit log, and getting it wrong in
  either direction is a real security consequence, not a tuning knob.

## Ticket and SLA design

- **Explicit state machine, not a free-form status field** (ADR-019).
  Status changes go through a named transition matrix; `Closed` is
  terminal for every role including Administrator; only
  `Resolved → Open` reopens a ticket. The matrix is the single source of
  truth on both backend and frontend (the frontend's copy is pinned by an
  exact-contents test against the backend's).
- **Optimistic concurrency (compare-and-swap), not locking** (ADR-019/020).
  Ticket assignment, status transitions, and asset assignment all use a
  conditional `updateMany` gated on the row's last-read state. A losing
  concurrent request gets a clean `409`, verified under genuinely
  concurrent load to produce exactly one winner, not just asserted in a
  unit test.
- **SLA policy is snapshotted onto the ticket at creation** (ADR-020), so
  a later change to the policy table never rewrites an in-flight ticket's
  targets. Pause/resume shifts due dates forward by the paused duration
  rather than tracking elapsed time separately; a reopen reuses the same
  pause-credit mechanism, anchored to the **database's** clock specifically
  to avoid clock-skew corruption.
- **SLA state is backend-authoritative on the frontend, never re-derived**
  (ADR-021). The browser ages the backend's own `minutesRemaining` locally
  between polls; it never computes breach/at-risk from a due date and
  `Date.now()`.

## Asset management

- **The assignment ledger *is* the history** — no separate audit table
  (see the Phase 8a section of `progress.md`; reuses ADR-019's pattern
  rather than a new ADR). `PATCH /assets/:id/assignment` is the single
  seam every assignment change funnels through, so `status` and
  `currentAssigneeId` cannot drift out of sync with the ledger behind the
  scenes — enforced by a partial unique index allowing at most one open
  assignment per asset.

## AI assistant isolation

- **Off by default, provider-abstracted, and never a write path**
  (ADR-023). No `AI_PROVIDER`/`AI_API_KEY` means the feature is fully
  absent, not degraded. The `disabled`/`mock`/`anthropic` providers share
  one interface, so the application code never branches on which is
  active. Nothing the assistant produces can change a ticket by itself —
  applying a suggestion is always a second explicit call through the
  ordinary ticket-mutation endpoints, with the same validation and history
  write as a human-typed change.

## Docker and CI choices

- **Multi-stage images, non-root API process, migration as its own
  one-shot job** (ADR-009). Schema migration is explicitly not a step
  inside the API's own start-up, so a failed migration can't leave a
  half-started API process to confuse.
- **The API is not published to the host in Compose** — only nginx is,
  proxying `/api` — because the refresh cookie's `SameSite=Strict` and
  same-origin requirements mean a second, directly-published API route
  couldn't authenticate anyway; it would only add attack surface.
- **CI enforces every gate the project runs locally, including the image
  builds** (ADR-010). Since Docker isn't installed on the authoring
  machine, CI is deliberately the first place the container images will
  ever actually be built and the first place `nginx.conf` is syntax-checked
  — not an afterthought job, but the actual verification step for Phase 14.
- **No deployment job, deliberately** (ADR-010/027). A workflow written
  against a hosting target that doesn't exist, or one carrying empty
  secret references waiting to be filled in, is judged worse than an
  honest gap.

## Deployment posture

- **Same-origin only; CORS is deliberately absent in production**
  (ADR-027). The `SameSite=Strict` refresh cookie cannot travel
  cross-origin no matter what CORS allows, so a split-origin deployment
  is a design change, not a configuration flag — production CORS being
  "none" is the decision, not an omission waiting to be filled in.
- **Security response headers come from the edge (nginx), not from the
  application** (ADR-027) — a deliberate choice that means a different
  topology (no nginx in front) would need to replicate them itself.
- **`/health` is readiness, `/health/live` is liveness, and they must stay
  different** (ADR-027) — pointing a liveness probe at the database would
  turn a brief Postgres blip into a rolling restart of every instance.
- **Nothing is deployed, and nothing claims otherwise.** No hosting
  account, managed database, registry, domain, or credential exists;
  `docs/deployment.md` lists the external steps, in order, that each
  unlock one remaining Phase 16 checklist item.

## Where to go deeper

- `DECISIONS.md` — the full ADRs, including alternatives considered and
  consequences.
- `docs/architecture/system-architecture.md` — the request pipeline and
  component diagram this summary's application-shape decisions produced.
- `docs/architecture/database-erd.md` — the schema these data-layer
  decisions produced.
- `docs/deployment.md` — the operational detail behind the deployment
  posture decisions above.
