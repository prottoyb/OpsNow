import { KnowledgeArticleStatus, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

/**
 * Per-row knowledge-article visibility scoping — the knowledge-base
 * counterpart of `ticket-visibility.ts` and `asset-visibility.ts` (see
 * DECISIONS.md ADR-019): an Employee may only read PUBLISHED articles;
 * staff may read any non-soft-deleted article, in any status.
 *
 * Drafts are staff-only for a reason beyond tidiness: a draft is
 * unreviewed internal writing — troubleshooting notes, escalation paths,
 * half-finished workarounds — and its mere EXISTENCE is information about
 * what the support team is currently working on. That is why an
 * out-of-scope article is a 404 and never a 403 anywhere in this module.
 *
 * Lives here, service-free, for the same reason the other two do: both
 * KnowledgeBaseService and (via delegation) the ticket <-> article link
 * routes build their `where` from the same single rule, with no circular
 * import.
 */
export function knowledgeArticleVisibilityWhere(
  user: AuthenticatedUser,
): Prisma.KnowledgeBaseArticleWhereInput {
  return {
    deletedAt: null,
    ...(user.role === Role.Employee
      ? { status: KnowledgeArticleStatus.Published }
      : {}),
  };
}

/**
 * The SAME rule expressed as a raw-SQL predicate, for the full-text
 * search path — `search_vector` is an `Unsupported("tsvector")` column
 * that Prisma cannot query, so that one code path has to drop to
 * `$queryRaw` and cannot reuse the `where` object above.
 *
 * It is deliberately defined here, immediately beside its Prisma twin,
 * rather than inline in the service: a raw query whose visibility clause
 * silently drifts weaker than the ORM path's is the single highest-risk
 * failure mode in this module, and keeping the two definitions adjacent
 * is what makes that drift visible to a reviewer in one glance.
 *
 * Assumes the `knowledge_base_articles` table is aliased `a`.
 */
export function knowledgeArticleVisibilitySql(
  user: AuthenticatedUser,
): Prisma.Sql {
  if (user.role === Role.Employee) {
    return Prisma.sql`a.deleted_at IS NULL AND a.status = ${KnowledgeArticleStatus.Published}::"KnowledgeArticleStatus"`;
  }
  return Prisma.sql`a.deleted_at IS NULL`;
}
