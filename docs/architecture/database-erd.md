# Database Schema (ERD)

PostgreSQL with Prisma as the schema/migration source of truth
(`backend/prisma/schema.prisma`). UUID primary keys throughout, except
`Ticket.ticketNumber` (a human-facing auto-incrementing integer) and the
two link tables, which use composite primary keys. Split into two diagrams
for readability — core ITSM tables, then the supporting/content/security
tables — with the tables that bridge both groups (`User`, `Ticket`)
repeated in each.

Constructs Prisma cannot express declaratively (CHECK constraints,
partial/filtered unique indexes, the generated `tsvector` search column)
are added by hand to the migration SQL and are called out below rather
than shown on the diagram, which is ERD notation, not DDL.

See [`docs/diagrams/`](../diagrams/README.md) for the full eleven-diagram
set, including these two ERDs alongside the runtime architecture, auth
flow, RBAC, SLA lifecycle, CI pipeline, deployment topology, and
ticket-mutation concurrency diagrams.

## Core ITSM tables

```mermaid
erDiagram
    USER ||--o{ TICKET : "requests"
    USER ||--o{ TICKET : "is assigned"
    USER ||--o{ TICKET_COMMENT : "authors"
    USER ||--o{ TICKET_HISTORY : "acts as"
    USER ||--o{ ASSET : "currently holds"
    USER ||--o{ ASSET_ASSIGNMENT : "receives"
    USER ||--o{ ASSET_ASSIGNMENT : "grants"

    TICKET_CATEGORY ||--o{ TICKET_CATEGORY : "parent of"
    TICKET_CATEGORY ||--o{ TICKET : "classifies"

    TICKET ||--o{ TICKET_COMMENT : "has"
    TICKET ||--o{ TICKET_HISTORY : "has"
    TICKET ||--o| TICKET_SLA : "has one"
    TICKET }o--o{ ASSET : "linked via TICKET_ASSET"

    SLA_POLICY ||--o{ TICKET_SLA : "snapshotted onto"

    ASSET_TYPE ||--o{ ASSET : "classifies"
    ASSET ||--o{ ASSET_ASSIGNMENT : "has (ledger)"

    USER {
        uuid id PK
        string email UK
        string passwordHash
        Role role
        boolean isActive
        timestamptz deletedAt "soft delete"
    }

    TICKET {
        uuid id PK
        int ticketNumber UK "human-facing, autoincrement"
        string subject
        text description
        uuid requesterId FK
        uuid assigneeId FK "nullable"
        uuid categoryId FK "nullable"
        TicketPriority priority
        TicketStatus status
        int reopenedCount
        timestamptz resolvedAt "nullable"
        timestamptz closedAt "nullable"
        timestamptz deletedAt "soft delete"
    }

    TICKET_COMMENT {
        uuid id PK
        uuid ticketId FK
        uuid authorId FK
        text body
        CommentVisibility visibility "Public | Internal"
    }

    TICKET_HISTORY {
        uuid id PK
        uuid ticketId FK
        uuid actorId FK "nullable"
        string fieldName
        string oldValue "nullable"
        string newValue "nullable"
        timestamptz createdAt "append-only"
    }

    TICKET_CATEGORY {
        uuid id PK
        string name
        uuid parentId FK "nullable, self-referencing"
        boolean isActive
    }

    SLA_POLICY {
        uuid id PK
        string name UK
        TicketPriority priority
        int responseTimeMinutes
        int resolutionTimeMinutes
        boolean isActive
    }

    TICKET_SLA {
        uuid id PK
        uuid ticketId FK,UK "one-to-one"
        uuid slaPolicyId FK "nullable, snapshotted"
        int responseTargetMinutes "copied at creation"
        int resolutionTargetMinutes "copied at creation"
        timestamptz responseDueAt
        timestamptz responseAt "nullable"
        boolean responseBreached
        timestamptz resolutionDueAt
        boolean resolutionBreached
        timestamptz onHoldStartedAt "nullable, dual-purpose anchor"
        int totalPausedMinutes
    }

    ASSET {
        uuid id PK
        string assetTag UK
        string name
        uuid assetTypeId FK
        AssetStatus status
        uuid currentAssigneeId FK "nullable"
        timestamptz deletedAt "soft delete"
    }

    ASSET_TYPE {
        uuid id PK
        string name UK
        boolean isActive
    }

    ASSET_ASSIGNMENT {
        uuid id PK
        uuid assetId FK
        uuid assignedToId FK
        uuid assignedById FK
        timestamptz assignedAt
        timestamptz returnedAt "nullable — null means open"
    }
```

Notable constraints not visible in ERD notation:

- `tickets_closed_requires_resolved` (CHECK): a ticket cannot reach
  `Closed` without `resolvedAt` set.
- A partial unique index on `asset_assignments` allows at most one **open**
  assignment (`returnedAt IS NULL`) per asset at a time — the mechanism
  that keeps `Asset.status`/`currentAssigneeId` and the ledger from
  drifting apart under concurrent writes.
- `TicketAsset` (the ticket↔asset link) is a composite-key join table
  (`@@id([ticketId, assetId])`), not shown as its own box above; the
  `}o--o{` edge between `TICKET` and `ASSET` represents it.

## Supporting: knowledge base, notifications, audit, sessions

```mermaid
erDiagram
    USER ||--o{ REFRESH_TOKEN : "owns"
    REFRESH_TOKEN ||--o| REFRESH_TOKEN : "rotates to"

    USER ||--o{ KNOWLEDGE_BASE_ARTICLE : "authors"
    USER ||--o{ KNOWLEDGE_BASE_ARTICLE_FEEDBACK : "gives"
    KNOWLEDGE_BASE_CATEGORY ||--o{ KNOWLEDGE_BASE_CATEGORY : "parent of"
    KNOWLEDGE_BASE_CATEGORY ||--o{ KNOWLEDGE_BASE_ARTICLE : "classifies"
    KNOWLEDGE_BASE_ARTICLE ||--o{ KNOWLEDGE_BASE_ARTICLE_FEEDBACK : "receives"
    TICKET }o--o{ KNOWLEDGE_BASE_ARTICLE : "linked via TICKET_KNOWLEDGE_ARTICLE"

    USER ||--o{ NOTIFICATION : "receives"
    TICKET ||--o{ NOTIFICATION : "concerns"

    USER ||--o{ AUDIT_LOG : "acts (nullable FK)"

    REFRESH_TOKEN {
        uuid id PK
        uuid userId FK
        string tokenHash UK "SHA-256"
        timestamptz expiresAt
        timestamptz revokedAt "nullable"
        uuid replacedById FK "nullable, self-referencing"
        inet ipAddress "nullable"
    }

    KNOWLEDGE_BASE_CATEGORY {
        uuid id PK
        string name
        uuid parentId FK "nullable, self-referencing"
        boolean isActive
    }

    KNOWLEDGE_BASE_ARTICLE {
        uuid id PK
        uuid categoryId FK "nullable"
        uuid authorId FK
        string title
        string slug UK
        text content
        KnowledgeArticleStatus status "Draft|Published|Archived"
        int viewCount
        tsvector searchVector "generated, GIN-indexed"
        timestamptz deletedAt "soft delete, unused by API"
    }

    KNOWLEDGE_BASE_ARTICLE_FEEDBACK {
        uuid id PK
        uuid articleId FK
        uuid userId FK
        boolean isHelpful
        text comment "nullable"
    }

    NOTIFICATION {
        uuid id PK
        uuid recipientId FK
        NotificationType type
        string title
        uuid ticketId FK "nullable"
        timestamptz readAt "nullable"
    }

    AUDIT_LOG {
        uuid id PK
        uuid actorId FK "nullable"
        string action
        string entityType "nullable, polymorphic, no FK"
        uuid entityId "nullable, polymorphic, no FK"
        json metadata "nullable, structurally redacted"
        inet ipAddress "nullable"
        timestamptz createdAt "append-only, no update/delete route"
    }
```

Notable modeling decisions not visible in ERD notation:

- `AuditLog.entityType`/`entityId` are a deliberate polymorphic reference
  with **no foreign key** — an approved trade-off from the Phase 2 design
  (see ADR-025) so the audit table doesn't need a constraint per
  referenceable entity type.
- `KnowledgeBaseArticle.searchVector` is a PostgreSQL `GENERATED ALWAYS AS
  ... STORED` `tsvector` column with a GIN index, added by hand to the
  migration SQL — full-text search runs entirely in Postgres via
  `ts_rank`, with no search service dependency (ADR-017/022).
- `Notification` exists in the schema (and is shown here for completeness)
  but has no application code using it yet — reserved for a phase that was
  never scheduled, not a bug.
- `RefreshToken.replacedById` self-references the next token in a
  rotation chain, which is how reuse-of-an-already-rotated-token is
  detected and used to revoke an entire token family.

## Full table count

18 tables, 7 enums (`Role`, `TicketPriority`, `TicketStatus`,
`CommentVisibility`, `AssetStatus`, `KnowledgeArticleStatus`,
`NotificationType`). See `backend/prisma/schema.prisma` for the
authoritative definition and `backend/prisma/migrations/` for the exact
SQL, including the hand-added CHECK constraints, partial unique indexes,
and the generated search column.
