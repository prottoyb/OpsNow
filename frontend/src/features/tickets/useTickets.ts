import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import type {
  CreateTicketCommentInput,
  CreateTicketInput,
  ListTicketsQuery,
  TicketPriority,
  TicketStatus,
  UpdateTicketInput,
} from '../../types/api';
import * as api from './tickets.api';

/**
 * Every key is namespaced by the signed-in user id.
 *
 * What a given ticket endpoint returns depends on who is asking — an
 * Employee is server-scoped to their own tickets and never receives internal
 * notes. Keying by user means two identities can never collide on one cache
 * entry. `AuthContext` additionally calls `queryClient.clear()` on any
 * identity change, so this is belt and braces on a confidentiality boundary.
 */
export const ticketKeys = {
  root: (userId: string) => ['tickets', userId] as const,
  list: (userId: string, query: ListTicketsQuery) =>
    ['tickets', userId, 'list', query] as const,
  detail: (userId: string, ticketId: string) =>
    ['tickets', userId, 'detail', ticketId] as const,
  comments: (userId: string, ticketId: string) =>
    ['tickets', userId, 'comments', ticketId] as const,
  history: (userId: string, ticketId: string) =>
    ['tickets', userId, 'history', ticketId] as const,
  categories: (userId: string) => ['ticket-categories', userId] as const,
};

function useUserId(): string {
  const { user } = useAuth();
  // Queries only run behind ProtectedRoute, so a user is always present in
  // practice; the fallback keeps the key type simple.
  return user?.id ?? 'anonymous';
}

export function useTicketList(query: ListTicketsQuery) {
  const userId = useUserId();
  return useQuery({
    queryKey: ticketKeys.list(userId, query),
    queryFn: () => api.listTickets(query),
    // Keeps the current page visible while the next one loads instead of
    // collapsing the table back to a skeleton on every filter change.
    placeholderData: keepPreviousData,
  });
}

export function useTicket(ticketId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: ticketKeys.detail(userId, ticketId),
    queryFn: () => api.getTicket(ticketId),
  });
}

export function useTicketComments(ticketId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: ticketKeys.comments(userId, ticketId),
    queryFn: () => api.listTicketComments(ticketId, { limit: 100 }),
  });
}

/**
 * Staff-only endpoint. `enabled` keeps an Employee from firing a request
 * that can only ever come back 403 — a UI nicety, not the access control,
 * which lives in the backend controller's `@Roles()` guard and again in
 * `TicketsService.findHistory()`.
 */
export function useTicketHistory(ticketId: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ticketKeys.history(userId, ticketId),
    queryFn: () => api.listTicketHistory(ticketId, { limit: 100 }),
    enabled,
  });
}

export function useTicketCategories() {
  const userId = useUserId();
  return useQuery({
    queryKey: ticketKeys.categories(userId),
    queryFn: api.listTicketCategories,
    // Categories are effectively static within a session.
    staleTime: 5 * 60 * 1000,
  });
}

function invalidateTicket(
  queryClient: QueryClient,
  userId: string,
  ticketId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: ticketKeys.detail(userId, ticketId),
  });
  void queryClient.invalidateQueries({
    queryKey: ticketKeys.history(userId, ticketId),
  });
  // Any ticket change can move it in or out of the active list filter.
  void queryClient.invalidateQueries({
    queryKey: ['tickets', userId, 'list'],
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.createTicket(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tickets', userId, 'list'],
      });
    },
  });
}

export function useUpdateTicket(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: UpdateTicketInput) => api.updateTicket(ticketId, input),
    onSuccess: () => invalidateTicket(queryClient, userId, ticketId),
  });
}

export function useUpdateTicketStatus(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (status: TicketStatus) =>
      api.updateTicketStatus(ticketId, status),
    onSuccess: () => invalidateTicket(queryClient, userId, ticketId),
  });
}

export function useUpdateTicketPriority(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (priority: TicketPriority) =>
      api.updateTicketPriority(ticketId, priority),
    onSuccess: () => invalidateTicket(queryClient, userId, ticketId),
  });
}

export function useUpdateTicketAssignment(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (assigneeId: string | null) =>
      api.updateTicketAssignment(ticketId, assigneeId),
    onSuccess: () => invalidateTicket(queryClient, userId, ticketId),
  });
}

export function useCreateTicketComment(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: CreateTicketCommentInput) =>
      api.createTicketComment(ticketId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ticketKeys.comments(userId, ticketId),
      });
    },
  });
}

/** Refetches everything on a ticket — used by the 403/409 recovery paths. */
export function useRefetchTicket(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return () => invalidateTicket(queryClient, userId, ticketId);
}
