# OpsNow — Architecture Diagrams

OpsNow is a full-stack IT Service Management (ITSM) platform: a React
single-page app talking to a versioned NestJS REST API, backed by a single
PostgreSQL database (18 tables). Eleven diagrams cover it end to end: the
runtime architecture, the two halves of the database schema, the product's
feature set, the ticket workflow and its concurrency guarantees, the
authentication model, the access-control model, the SLA engine, the CI
pipeline, and how the system runs (local development and container/runtime).

Each numbered diagram has a Mermaid source (`.mmd`) and a rendered PNG of
the same name — the PNG is what renders inline on GitHub, the `.mmd` is
what to edit. Regenerate the PNG after any source change; don't hand-edit
the image:

```
npx --yes -p @mermaid-js/mermaid-cli mmdc -i <name>.mmd -o <name>.png -c .mermaid-theme.json -p .puppeteer-config.json -b white -s 2
```

For deeper technical detail than these diagrams carry, see
[`../architecture/system-architecture.md`](../architecture/system-architecture.md),
[`../architecture/database-erd.md`](../architecture/database-erd.md),
[`../decisions-summary.md`](../decisions-summary.md) and the full
[`../../DECISIONS.md`](../../DECISIONS.md) ADR log.

---

## 1. System Architecture
`01-system-architecture.mmd` / `.png`

**What it shows**
The runtime request path: browser → same-origin edge (Vite dev proxy /
nginx) → the NestJS API's global guard/pipe/filter stack → eight feature
modules → Prisma → PostgreSQL, with a dashed, optional branch to an
external AI provider.

**Why it matters**
A conventional two-tier web application, deliberately — no microservices,
no message queue, no API gateway. The same-origin edge exists because the
refresh-token cookie is `httpOnly` and `SameSite=Strict` with no CORS
configured at all (ADR-027); a split-origin deployment would be a design
change, not a flag to flip.

**Key implementation detail**
Every request passes through the same global stack regardless of module:
`JwtAuthGuard` (default-deny, ADR-018) → `RolesGuard` (fails closed,
ADR-006) → a global `ValidationPipe` → the handler → `AllExceptionsFilter`
— plus a service-level row-visibility layer underneath route-level RBAC.

---

## 2. Core Data Model
`02-database-erd-core.mmd` / `.png`

**What it shows**
The ERD for the ticket/SLA/asset tables: `USER`, `TICKET`,
`TICKET_COMMENT`, `TICKET_HISTORY`, `TICKET_CATEGORY`, `SLA_POLICY`,
`TICKET_SLA`, `ASSET`, `ASSET_TYPE`, `ASSET_ASSIGNMENT`.

**Why it matters**
Tickets and assets separate ordinary mutable current-state fields
(`status`, `currentAssigneeId`) from a dedicated append-only ledger
(`TicketHistory`, `AssetAssignment`) — auditable history without
event-sourcing current state.

**Key implementation detail**
`TICKET_SLA` is a true one-to-one extension of `TICKET`, snapshotted from
`SLA_POLICY` at creation time so a later policy edit never rewrites an
in-flight ticket's targets. UUID primary keys throughout, except
composite-key bridge tables (`TicketAsset`) and `Ticket.ticketNumber`, a
human-facing auto-increment integer.

---

## 3. Supporting Data Model
`03-database-erd-supporting.mmd` / `.png`

**What it shows**
`REFRESH_TOKEN`, the knowledge-base cluster, `NOTIFICATION`, and
`AUDIT_LOG`.

**Why it matters**
This half of the schema carries the project's security and operational
posture: sessions that can detect their own theft, an audit trail that's
cheap to extend, full-text search with no external dependency.

**Key implementation detail**
`REFRESH_TOKEN.replacedById` self-references the row that replaced it —
the mechanism behind reuse detection. `AUDIT_LOG.entityType`/`entityId` is
an intentionally unconstrained polymorphic reference (ADR-025), and full
KB search runs on a generated Postgres `tsvector` column.

---

## 4. Feature Overview
`04-feature-overview.mmd` / `.png`

**What it shows**
A non-technical map of OpsNow's seven user-facing capabilities — Ticket
Management, SLA Management, Asset Management, Knowledge Base, Dashboard &
Analytics, Audit Log, and an optional AI Assistant — under a four-role
access model.

**Why it matters**
Signals this is one dataset viewed through a role-appropriate lens, not
seven disconnected tools (see diagram 7).

**Key implementation detail**
The AI Assistant is advisory-only: it can draft a suggestion, but nothing
it produces changes a ticket except through the same mutation path
(diagram 11) a human-typed change would take.

---

## 5. Ticket Lifecycle
`05-ticket-lifecycle.mmd` / `.png`

**What it shows**
The ticket status state machine: `New → Open → InProgress`, a pause
branch to `OnHold` and back, `Resolved → Closed`, and a reopen edge from
`Resolved` back to `Open`.

**Why it matters**
`Closed` is terminal for every role, including Administrator, and
`Resolved → Open` (reopen) is the only self-service transition a
non-staff requester may trigger themselves.

**Key implementation detail**
The transition matrix is enforced entirely server-side. The frontend
keeps a hand-maintained mirror for UI convenience only — never the
enforcement path.

---

## 6. Authentication & Refresh Token Flow
`06-auth-refresh-flow.mmd` / `.png`

**What it shows**
One full auth cycle: login, an expired access token, a refresh, both
possible refresh outcomes, and logout.

**Why it matters**
The access token lives only in memory; the refresh token travels in an
`httpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/v1/auth` —
so an XSS payload that can read the DOM still can't read either token.

**Key implementation detail**
Refresh rotates the token in the same transaction that validates it; if
an already-rotated token is replayed, the entire token family is revoked,
not just the reused token.

---

## 7. Roles & Access Model
`07-rbac-access-model.mmd` / `.png`

**What it shows**
Four fixed roles — Employee, Support Agent, Team Lead, Administrator —
as a ladder where each tier adds a specific capability.

**Why it matters**
A role is a fixed enum, not a dynamic permissions table — simple by
design, with cumulative access an emergent property of how per-route role
lists happen to nest.

**Key implementation detail**
Authorization is layered, not uniformly doubled: `RolesGuard` enforces a
route's declared role requirement only where one is declared; independent
service-level ownership/visibility checks constrain every route's data
regardless.

---

## 8. SLA Clock Lifecycle
`08-sla-lifecycle.mmd` / `.png`

**What it shows**
The life of a ticket's response and resolution clocks — creation,
pausing, resuming, completion, reopening.

**Why it matters**
State is a richer live model (`Running`, `AtRisk`, `Paused`, `NoResponse`)
recomputed on every read while open, then frozen permanently into `Met`
or `Breached` once the clock completes.

**Key implementation detail**
Pausing (`OnHold`) doesn't shift due dates at that instant; resuming
applies a pure additive shift (`due_at += elapsed_pause`) anchored to the
database's clock, not the application server's.

---

## 9. CI Pipeline
`09-cicd-pipeline.mmd` / `.png`

**What it shows**
Five independent GitHub Actions jobs triggered on every push — Frontend,
Backend, Browser E2E, Dependency Audit, and Container Images.

**Why it matters**
The Frontend, Backend and Dependency Audit jobs independently repeat the
project's local quality checks against a real, ephemeral environment;
the Container Images job additionally builds and validates all three
production images and the nginx configuration. This is a
continuous-integration pipeline — there is no deployment stage.

**Key implementation detail**
All five jobs passing is the project's own release/merge acceptance
criterion. Repository protections (e.g. branch rules) are configured
separately from the workflow itself. See
[`../deployment.md`](../deployment.md) for current deployment status.

---

## 10. Runtime / Deployment Topology
`10-runtime-deployment-topology.mmd` / `.png`

**What it shows**
How OpsNow actually runs in two environments: local development (Vite dev
server + local Postgres) and the container/runtime topology defined in
`docker-compose.yml` (nginx, backend, migrate, Postgres).

**Why it matters**
The container/runtime topology is the intended production/reference
deployment shape, validated by CI on every push (`docker compose config`,
`nginx -t`). It documents the configured, CI-validated topology, not
external hosting — see [`../deployment.md`](../deployment.md) for the
project's current deployment status and what remains external to this
repository.

**Key implementation detail**
The backend container is never published to the host — reachable only
inside the Docker network; nginx plays the same same-origin-proxy role in
containers that Vite's dev proxy plays locally.

---

## 11. Ticket Mutation & Concurrency Flow
`11-ticket-update-concurrency-flow.mmd` / `.png`

**What it shows**
The full path a ticket-mutation request takes across all four mutation
routes (`update`, `assign`, `updateStatus`, `updatePriority`):
authorization, validation, optimistic concurrency, atomic history, and
conditional SLA integration.

**Why it matters**
There is no `version` column on `Ticket`. Each endpoint instead uses a
targeted compare-and-swap predicate on the specific field it just read
(`updatedAt`, `assigneeId`, `priority`, or `status`) — a zero-row match
means someone else changed that field first, and the request fails with
`409` rather than silently overwriting.

**Key implementation detail**
The ticket update, its conditional SLA side effect, and its
`TicketHistory` row all commit in one transaction. The audit write
happens after commit, deliberately outside the transaction, since a
failed audit write must never undo an already-committed ticket update.

---

## Regenerating these diagrams

All eleven diagrams were rendered with `@mermaid-js/mermaid-cli` (`mmdc`)
using the shared theme in `.mermaid-theme.json` — a custom indigo/lavender
`base` theme that gives every diagram a consistent look — and the
sandboxing flags in `.puppeteer-config.json`. If the application changes
in a way that affects one of these diagrams, edit the `.mmd` source and
re-render with the command at the top of this file; don't hand-edit the
PNG.
