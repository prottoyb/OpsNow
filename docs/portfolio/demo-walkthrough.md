# Demo Walkthrough

A suggested flow for a live demo, a screen recording, or walking an
interviewer through the running application. Assumes both dev servers are
running locally (see `README.md`'s Local Development Setup) and the
database has been seeded (`npm run prisma:seed` in `backend/`).

## Demo credentials

These are **local development seed accounts only** — created by
`backend/prisma/seed.ts`, which only ever runs against a developer's own
`opsnow_dev` database. They are not production credentials, because
nothing is deployed; documenting them here is safe for exactly that
reason, and they must never be reused if a real deployment is ever stood
up (the seed script must never run against one — see `docs/deployment.md`).

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@opsnow.local` | `DevPassword123!` |
| Team Lead | `teamlead@opsnow.local` | `DevPassword123!` |
| Support Agent | `agent1@opsnow.local` | `DevPassword123!` |
| Support Agent | `agent2@opsnow.local` | `DevPassword123!` |
| Employee | `employee1@opsnow.local` | `DevPassword123!` |
| Employee | `employee2@opsnow.local` | `DevPassword123!` |
| Employee | `employee3@opsnow.local` | `DevPassword123!` |

## Suggested flow

### 1. Log in as Team Lead (`teamlead@opsnow.local`)

Team Lead sees everything a Support Agent sees, plus per-agent analytics
— a good default role to start a demo from.

### 2. Dashboard

`/dashboard` (or wherever the app lands post-login) — point out the stat
tiles are computed live from the seeded ticket/SLA data, not hardcoded.
The seed data (53 tickets, 20 assets, 11 KB articles, deterministically
generated with 10 tickets deliberately breaching SLA) exists specifically
so these numbers aren't zero or trivially uniform in a fresh checkout.

### 3. Tickets

`/tickets` — filter by status/priority/assignee, open a ticket, walk
through: assignment, a status transition (show the transition matrix
constraint by trying an invalid one, e.g. attempting to reopen a `Closed`
ticket — it's rejected), adding a public comment vs. an internal note
(log out and back in as an Employee to show the internal note is
genuinely invisible, not just hidden by a CSS class), and the ticket
history panel (staff-only).

### 4. SLA

`/sla` — the staff-only dashboard: response/resolution metric groups, the
active policy table, the "needs attention" emphasis tile. Then open a
ticket and point at its SLA panel: both clocks, badges reflecting
backend-authoritative state, and — if one is handy in the seed data — an
at-risk or breached ticket to show the visual distinction is not color
alone (a shape-coded glyph accompanies the color).

### 5. Assets

`/assets` — list, open one, show its assignment history (the ledger is
the entire audit trail — no separate history model). Demonstrate an
assignment change and point out the CAS behavior conceptually (two people
can't win an assignment race).

### 6. Knowledge base

`/knowledge-base` (or its actual route) — the search-led layout, open an
article, and if time allows, log in as staff to show the authoring/status
(`Draft`/`Published`/`Archived`) controls an Employee never sees.

### 7. Audit log

`/audit-logs` — Administrator-only, so switch to `admin@opsnow.local`
here. Show the append-only trail: authentication events, ticket changes,
assignment changes, permission denials. Point out there's no edit/delete
route — an e2e test asserts their absence, not just their absence from
the UI.

### 8. AI assistant

On a ticket detail page, open the AI assistant panel. If `AI_PROVIDER` is
unset (the out-of-the-box state), the panel shows a quiet "not available"
note — explain this is the intended default, not a broken build. If
`AI_PROVIDER=mock` is set, run triage/draft/summary and point out the UI
explicitly labels the output as canned sample text, and that applying a
suggestion is a second explicit click through the ordinary ticket-update
path — nothing the assistant says can change the ticket by itself.

### 9. Mobile / responsive note

Resize the browser (or open dev tools' device toolbar) to ~375px width.
Show the nav collapsing into the mobile drawer (Escape to close, focus
returns to the trigger), and that the ticket/asset tables collapse to a
card layout rather than producing horizontal scroll.

### 10. Role comparison: log in as an Employee

`employee1@opsnow.local` — same app, visibly narrower: no SLA/analytics/
audit nav links at all (not just disabled — a deep link to `/audit-logs`
falls through to the ordinary "not found" page, since row/route
visibility is enforced server-side, not hidden by a client-side route
guard alone), only their own tickets and currently-held assets, no
internal notes anywhere, no AI panel actions beyond what staff can do
even if a route were guessed. This comparison is the fastest way to make
the "security is enforced on the backend, not just hidden in the UI"
claim concrete rather than asserted.

## If asked to go further

- Open Swagger (`/api/docs`) and show the role gates are visible directly
  in the generated documentation, not just in this walkthrough.
- Open `docs/architecture/system-architecture.md` and
  `docs/architecture/database-erd.md` for the diagrams.
- Reference `DECISIONS.md`/`docs/decisions-summary.md` for why a specific
  design choice was made, and `progress.md` for the specific review
  findings that shaped it.
