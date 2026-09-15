import { apiFetch } from '../../lib/api/client';
import type {
  CreateTicketCommentInput,
  CreateTicketInput,
  ListTicketsQuery,
  Paginated,
  Ticket,
  TicketCategory,
  TicketComment,
  TicketHistoryEntry,
  TicketPriority,
  TicketStatus,
  UpdateTicketInput,
} from '../../types/api';

export function listTickets(
  query: ListTicketsQuery,
): Promise<Paginated<Ticket>> {
  return apiFetch<Paginated<Ticket>>('/tickets', { query: { ...query } });
}

export function getTicket(id: string): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}`);
}

export function createTicket(input: CreateTicketInput): Promise<Ticket> {
  return apiFetch<Ticket>('/tickets', { method: 'POST', body: input });
}

/**
 * The global ValidationPipe runs with `forbidNonWhitelisted: true`, so the
 * body must contain only the fields being changed — never a whole ticket
 * spread into a PATCH. Callers build a minimal diff.
 */
export function updateTicket(
  id: string,
  input: UpdateTicketInput,
): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: input });
}

export function updateTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function updateTicketPriority(
  id: string,
  priority: TicketPriority,
): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/priority`, {
    method: 'PATCH',
    body: { priority },
  });
}

/**
 * `assigneeId` is required-but-nullable on the backend DTO, so the key is
 * always sent: a string assigns, `null` unassigns. Omitting it is a 400.
 */
export function updateTicketAssignment(
  id: string,
  assigneeId: string | null,
): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/assignment`, {
    method: 'PATCH',
    body: { assigneeId },
  });
}

export function listTicketComments(
  id: string,
  query: { limit?: number; offset?: number } = {},
): Promise<Paginated<TicketComment>> {
  return apiFetch<Paginated<TicketComment>>(`/tickets/${id}/comments`, {
    query,
  });
}

export function createTicketComment(
  id: string,
  input: CreateTicketCommentInput,
): Promise<TicketComment> {
  return apiFetch<TicketComment>(`/tickets/${id}/comments`, {
    method: 'POST',
    body: input,
  });
}

/** Staff-only on the backend; an Employee receives 403. */
export function listTicketHistory(
  id: string,
  query: { limit?: number; offset?: number } = {},
): Promise<Paginated<TicketHistoryEntry>> {
  return apiFetch<Paginated<TicketHistoryEntry>>(`/tickets/${id}/history`, {
    query,
  });
}

/** Returns a BARE ARRAY, not a `{data,total}` envelope. */
export function listTicketCategories(): Promise<TicketCategory[]> {
  return apiFetch<TicketCategory[]>('/ticket-categories');
}
