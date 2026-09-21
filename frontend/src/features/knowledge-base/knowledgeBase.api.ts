import { apiFetch } from '../../lib/api/client';
import type {
  ArticleFeedbackEntry,
  ArticleFeedbackSummary,
  CreateArticleFeedbackInput,
  CreateArticleInput,
  KnowledgeArticle,
  KnowledgeArticleSummary,
  KnowledgeBaseCategory,
  ListArticlesQuery,
  Paginated,
  TicketKnowledgeArticle,
  UpdateArticleInput,
} from '../../types/api';

export function listArticles(
  query: ListArticlesQuery,
): Promise<Paginated<KnowledgeArticleSummary>> {
  return apiFetch<Paginated<KnowledgeArticleSummary>>('/kb-articles', {
    query: { ...query },
  });
}

/**
 * The only projection carrying `content`. Reading a Published article also
 * increments its view counter on the backend, which is why nothing in the UI
 * calls this to refresh a list row.
 */
export function getArticle(id: string): Promise<KnowledgeArticle> {
  return apiFetch<KnowledgeArticle>(`/kb-articles/${id}`);
}

/**
 * Staff only. The body carries title/content/categoryId and nothing else: an
 * article is always born `Draft`, authored by the caller, with a
 * server-derived slug, and `forbidNonWhitelisted` turns any extra property
 * into a 400.
 */
export function createArticle(
  input: CreateArticleInput,
): Promise<KnowledgeArticle> {
  return apiFetch<KnowledgeArticle>('/kb-articles', {
    method: 'POST',
    body: input,
  });
}

/**
 * Staff only, and finer-grained than that on the backend: a SupportAgent may
 * edit only their own articles, and may not send `status` at all. Callers
 * build a minimal diff — `forbidNonWhitelisted` rejects anything else, and an
 * unchanged field resent is a needless widening of what the PATCH claims to
 * change. `categoryId: null` clears the category (unlike a ticket's).
 */
export function updateArticle(
  id: string,
  input: UpdateArticleInput,
): Promise<KnowledgeArticle> {
  return apiFetch<KnowledgeArticle>(`/kb-articles/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

/**
 * Open to anyone who can already SEE the article — rating the guidance you
 * were given is the point of the feature. Returns the aggregate summary plus
 * the caller's own vote, never other readers' comments.
 */
export function submitArticleFeedback(
  id: string,
  input: CreateArticleFeedbackInput,
): Promise<ArticleFeedbackSummary> {
  return apiFetch<ArticleFeedbackSummary>(`/kb-articles/${id}/feedback`, {
    method: 'POST',
    body: input,
  });
}

/** Staff-only on the backend; an Employee receives 403. */
export function listArticleFeedback(
  id: string,
  query: { limit?: number; offset?: number } = {},
): Promise<Paginated<ArticleFeedbackEntry>> {
  return apiFetch<Paginated<ArticleFeedbackEntry>>(
    `/kb-articles/${id}/feedback`,
    { query },
  );
}

/** Returns a BARE ARRAY, not a `{data,total}` envelope. Active categories
 * only, and open to every authenticated role. */
export function listKnowledgeBaseCategories(): Promise<KnowledgeBaseCategory[]> {
  return apiFetch<KnowledgeBaseCategory[]>('/kb-categories');
}

/**
 * Returns a BARE, UNPAGINATED array — bounded by how many articles one ticket
 * has. Readable by anyone who can already see the ticket, and additionally
 * scoped to the caller's article visibility by the backend.
 */
export function listTicketArticles(
  ticketId: string,
): Promise<TicketKnowledgeArticle[]> {
  return apiFetch<TicketKnowledgeArticle[]>(
    `/tickets/${ticketId}/knowledge-articles`,
  );
}

/** Staff only. Idempotent: re-linking an already-linked article returns the
 * existing link rather than failing. */
export function linkTicketArticle(
  ticketId: string,
  articleId: string,
): Promise<TicketKnowledgeArticle> {
  return apiFetch<TicketKnowledgeArticle>(
    `/tickets/${ticketId}/knowledge-articles`,
    { method: 'POST', body: { articleId } },
  );
}

/** Staff only. 204 No Content; idempotent — unlinking something not linked
 * succeeds. */
export function unlinkTicketArticle(
  ticketId: string,
  articleId: string,
): Promise<void> {
  return apiFetch<void>(
    `/tickets/${ticketId}/knowledge-articles/${articleId}`,
    { method: 'DELETE' },
  );
}
