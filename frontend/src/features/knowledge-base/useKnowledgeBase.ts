import { useCallback } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import type {
  CreateArticleFeedbackInput,
  CreateArticleInput,
  ListArticlesQuery,
  UpdateArticleInput,
} from '../../types/api';
import * as api from './knowledgeBase.api';

/**
 * Every key is namespaced by the signed-in user id.
 *
 * What a given knowledge-base endpoint returns depends on who is asking — an
 * Employee is server-scoped to Published articles only, and the `feedback`
 * summary embedded in an article detail carries *that caller's own vote*.
 * Keying by user means two identities can never collide on one cache entry.
 * `AuthContext` additionally calls `queryClient.clear()` on any identity
 * change, so this is belt and braces on a confidentiality boundary.
 */
export const kbKeys = {
  /** Every list for this user, whatever its filters — the invalidation target. */
  lists: (userId: string) => ['kb-articles', userId, 'list'] as const,
  list: (userId: string, query: ListArticlesQuery) =>
    ['kb-articles', userId, 'list', query] as const,
  detail: (userId: string, articleId: string) =>
    ['kb-articles', userId, 'detail', articleId] as const,
  feedback: (userId: string, articleId: string) =>
    ['kb-articles', userId, 'feedback', articleId] as const,
  categories: (userId: string) => ['kb-categories', userId] as const,
  ticketArticles: (userId: string, ticketId: string) =>
    ['ticket-kb-articles', userId, ticketId] as const,
  /**
   * Every ticket's linked-article list for this user. The invalidation target
   * when an article changes: the embedded `KnowledgeArticleSummary` carries
   * `status` and `title`, and one article can be linked to several tickets,
   * so a retitle or a publish staleness-affects every one of them — not just
   * the ticket a panel-initiated change happened to be made from.
   */
  ticketArticlesAll: (userId: string) => ['ticket-kb-articles', userId] as const,
};

function useUserId(): string {
  const { user } = useAuth();
  // Queries only run behind ProtectedRoute, so a user is always present in
  // practice; the fallback keeps the key type simple.
  return user?.id ?? 'anonymous';
}

export function useArticleList(query: ListArticlesQuery, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: kbKeys.list(userId, query),
    queryFn: () => api.listArticles(query),
    // Keeps the current page visible while the next one loads instead of
    // collapsing the list back to a skeleton on every keystroke-debounce.
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useArticle(articleId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: kbKeys.detail(userId, articleId),
    queryFn: () => api.getArticle(articleId),
  });
}

export function useKnowledgeBaseCategories() {
  const userId = useUserId();
  return useQuery({
    queryKey: kbKeys.categories(userId),
    queryFn: api.listKnowledgeBaseCategories,
    // The taxonomy is effectively static within a session.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Staff-only endpoint. `enabled` keeps an Employee from firing a request that
 * can only ever come back 403 — a UI nicety, not the access control, which
 * lives in the backend controller's `@Roles()` guard and again in
 * `KnowledgeBaseService.findFeedback()`.
 */
export function useArticleFeedbackLog(articleId: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: kbKeys.feedback(userId, articleId),
    queryFn: () => api.listArticleFeedback(articleId, { limit: 100 }),
    enabled,
  });
}

function invalidateArticle(
  queryClient: QueryClient,
  userId: string,
  articleId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: kbKeys.detail(userId, articleId),
  });
  void queryClient.invalidateQueries({
    queryKey: kbKeys.feedback(userId, articleId),
  });
  // Any edit can move the article in or out of the active list filter, and
  // the summary rows carry the title, status and helpful counts.
  void queryClient.invalidateQueries({
    queryKey: kbKeys.lists(userId),
  });
  // A retitle or a publish alters the `KnowledgeArticleSummary` embedded in
  // every ticket that links this article, so all of them are invalidated —
  // not only the ticket a panel-initiated change came from.
  void queryClient.invalidateQueries({
    queryKey: kbKeys.ticketArticlesAll(userId),
  });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: CreateArticleInput) => api.createArticle(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kbKeys.lists(userId) });
    },
  });
}

export function useUpdateArticle(articleId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: UpdateArticleInput) =>
      api.updateArticle(articleId, input),
    onSuccess: () => invalidateArticle(queryClient, userId, articleId),
  });
}

/**
 * A vote changes `helpfulCount`/`notHelpfulCount`, which are carried by the
 * list rows and by every ticket's linked-article rows as well as by the
 * detail — so this goes through the same full invalidation as an edit.
 */
export function useSubmitArticleFeedback(articleId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: CreateArticleFeedbackInput) =>
      api.submitArticleFeedback(articleId, input),
    onSuccess: () => invalidateArticle(queryClient, userId, articleId),
  });
}

export function useTicketArticles(ticketId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: kbKeys.ticketArticles(userId, ticketId),
    queryFn: () => api.listTicketArticles(ticketId),
  });
}

export function useLinkTicketArticle(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (articleId: string) =>
      api.linkTicketArticle(ticketId, articleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kbKeys.ticketArticles(userId, ticketId),
      });
    },
  });
}

export function useUnlinkTicketArticle(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (articleId: string) =>
      api.unlinkTicketArticle(ticketId, articleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: kbKeys.ticketArticles(userId, ticketId),
      });
    },
  });
}

/** Refetches everything on an article — used by the 403/409 recovery paths. */
export function useRefetchArticle(articleId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useCallback(
    () => invalidateArticle(queryClient, userId, articleId),
    [queryClient, userId, articleId],
  );
}
