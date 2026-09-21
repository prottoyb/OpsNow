import { KnowledgeArticleStatus, Role } from '@prisma/client';

/**
 * Explicit status transition matrix, in the style of
 * `tickets.constants.ts`'s ALLOWED_TRANSITIONS (backend.md: business
 * rules live in the domain layer, not as a free-form enum write).
 *
 * Unlike a ticket's `Closed`, NO article status is terminal: `Archived`
 * is the retire path (there is no delete endpoint), and an archived
 * article must be able to come back as a `Draft` so it can be rewritten
 * and republished rather than retyped. An archived article deliberately
 * cannot jump straight back to `Published` — retired guidance gets
 * re-reviewed as a draft before it is authoritative again.
 */
export const ALLOWED_ARTICLE_TRANSITIONS: Readonly<
  Record<KnowledgeArticleStatus, readonly KnowledgeArticleStatus[]>
> = {
  [KnowledgeArticleStatus.Draft]: [
    KnowledgeArticleStatus.Published,
    KnowledgeArticleStatus.Archived,
  ],
  [KnowledgeArticleStatus.Published]: [
    KnowledgeArticleStatus.Draft,
    KnowledgeArticleStatus.Archived,
  ],
  [KnowledgeArticleStatus.Archived]: [KnowledgeArticleStatus.Draft],
};

/**
 * A transition to the SAME status is allowed and treated as a no-op by
 * the service, not as an error — unlike tickets, where re-submitting the
 * current status is rejected.
 *
 * The difference is the shape of the request: a ticket status change is a
 * dedicated single-field route, so a redundant one is almost certainly a
 * mistake worth reporting. An article PATCH is a general edit that a
 * client will naturally submit as a whole form (title + content +
 * category + status); erroring on the unchanged status would make every
 * ordinary copy-edit fail.
 */
export function isAllowedArticleTransition(
  from: KnowledgeArticleStatus,
  to: KnowledgeArticleStatus,
): boolean {
  return from === to || ALLOWED_ARTICLE_TRANSITIONS[from].includes(to);
}

/**
 * Publishing is an editorial act, not an authoring one: a SupportAgent
 * writes and revises articles, but only a TeamLead or an Administrator
 * decides what becomes official, customer-visible guidance (and what gets
 * retired). This is the narrower half of the two-tier authoring model —
 * see ARTICLE_EDIT_ANY_ROLES for the other half.
 */
export const ARTICLE_STATUS_ROLES: readonly Role[] = [
  Role.TeamLead,
  Role.Administrator,
];

export function canChangeArticleStatus(role: Role): boolean {
  return (ARTICLE_STATUS_ROLES as Role[]).includes(role);
}

/**
 * Roles that may edit the CONTENT of an article they did not write. A
 * SupportAgent may freely edit their own articles; editing a colleague's
 * is a review/correction action reserved for the same editorial roles.
 *
 * Note this failure is a 403, not a 404: the agent can legitimately READ
 * the article (staff see every non-deleted article), so hiding it would
 * be both a lie and a worse error message. 404 is reserved strictly for
 * "you cannot see this at all" — see `common/knowledge-article-visibility.ts`.
 */
export const ARTICLE_EDIT_ANY_ROLES: readonly Role[] = [
  Role.TeamLead,
  Role.Administrator,
];

export function canEditAnyArticle(role: Role): boolean {
  return (ARTICLE_EDIT_ANY_ROLES as Role[]).includes(role);
}
