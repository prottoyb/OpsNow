import type { KnowledgeArticleStatus, Role } from '../../types/api';

/**
 * Display labels and the transition matrix for `KnowledgeArticleStatus`, kept
 * out of `components/ArticleStatusBadge.tsx` so that file exports components
 * only — the same split the ticket feature makes between `transitions.ts` and
 * `TicketStatusBadge.tsx`, and what `react-refresh/only-export-components`
 * requires for fast refresh to work.
 */
const STATUS_LABELS: Record<KnowledgeArticleStatus, string> = {
  Draft: 'Draft',
  Published: 'Published',
  Archived: 'Archived',
};

export function articleStatusLabel(status: KnowledgeArticleStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Mirrors `ALLOWED_ARTICLE_TRANSITIONS` in
 * `backend/src/knowledge-base/knowledge-base.constants.ts`.
 *
 * No status is terminal: `Archived` is the retire path (there is no delete
 * endpoint) and an archived article can come back as a `Draft` to be
 * rewritten. `Archived -> Published` is deliberately NOT legal — retired
 * guidance is re-reviewed as a draft before it is authoritative again — so
 * the UI must never offer it. This mirror decides what is *offered*; the
 * backend re-validates every transition and answers 400 for an illegal one.
 */
const ALLOWED_TRANSITIONS: Record<
  KnowledgeArticleStatus,
  readonly KnowledgeArticleStatus[]
> = {
  Draft: ['Published', 'Archived'],
  Published: ['Draft', 'Archived'],
  Archived: ['Draft'],
};

export function allowedArticleTransitions(
  from: KnowledgeArticleStatus,
): readonly KnowledgeArticleStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

/**
 * Mirrors `ARTICLE_STATUS_ROLES`. Publishing is an editorial act, not an
 * authoring one: a SupportAgent writes and revises articles, but only a
 * TeamLead or Administrator decides what becomes official guidance and what
 * gets retired.
 */
export function canChangeArticleStatus(role: Role): boolean {
  return role === 'TeamLead' || role === 'Administrator';
}

/**
 * Mirrors `ARTICLE_EDIT_ANY_ROLES`. A SupportAgent may freely edit articles
 * they authored; editing a colleague's is a review action reserved for the
 * same editorial roles. Note the backend answers 403 (not 404) here — staff
 * can legitimately READ every article, so hiding it would be both a lie and a
 * worse error message.
 */
export function canEditAnyArticle(role: Role): boolean {
  return role === 'TeamLead' || role === 'Administrator';
}

/** The verb shown on the button that performs a given transition. */
const TRANSITION_LABELS: Record<KnowledgeArticleStatus, string> = {
  Draft: 'Unpublish',
  Published: 'Publish',
  Archived: 'Archive',
};

/**
 * `Draft` is reached from two different places and means two different things
 * there: from `Published` it is an unpublish, from `Archived` it is a
 * restore. Labelling both "Unpublish" would be wrong for the second.
 */
export function articleTransitionLabel(
  from: KnowledgeArticleStatus,
  to: KnowledgeArticleStatus,
): string {
  if (to === 'Draft' && from === 'Archived') {
    return 'Restore to draft';
  }
  return TRANSITION_LABELS[to];
}
