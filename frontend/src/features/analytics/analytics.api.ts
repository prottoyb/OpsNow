import { apiFetch } from '../../lib/api/client';
import type {
  AgentAnalytics,
  AnalyticsQuery,
  CategoryAnalytics,
  SlaAnalytics,
  TicketAnalytics,
} from '../../types/api';

/*
 * The first three routes are staff-only; `/analytics/agents` is narrower
 * still (TeamLead and Administrator). All four share one query shape. A role
 * that is not allowed receives 403 from the backend — the hooks avoid asking,
 * but the backend is the enforcement point.
 */

export function getTicketAnalytics(
  query: AnalyticsQuery,
): Promise<TicketAnalytics> {
  return apiFetch<TicketAnalytics>('/analytics/tickets', {
    query: { ...query },
  });
}

export function getSlaAnalytics(query: AnalyticsQuery): Promise<SlaAnalytics> {
  return apiFetch<SlaAnalytics>('/analytics/sla', { query: { ...query } });
}

export function getCategoryAnalytics(
  query: AnalyticsQuery,
): Promise<CategoryAnalytics> {
  return apiFetch<CategoryAnalytics>('/analytics/categories', {
    query: { ...query },
  });
}

export function getAgentAnalytics(
  query: AnalyticsQuery,
): Promise<AgentAnalytics> {
  return apiFetch<AgentAnalytics>('/analytics/agents', { query: { ...query } });
}
