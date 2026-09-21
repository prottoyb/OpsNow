import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import type { AnalyticsQuery } from '../../types/api';
import { isAnalyticsAgentRole } from '../../types/api';
import * as api from './analytics.api';

/**
 * Namespaced by the signed-in user id, like every other feature's keys: what
 * these endpoints return depends on who is asking (a caller's ticket
 * visibility scopes every figure), so two identities must never share a
 * cache entry. The full filter query is part of the key, so a filter change is
 * a new entry and a refetch.
 */
export const analyticsKeys = {
  tickets: (userId: string, query: AnalyticsQuery) =>
    ['analytics', userId, 'tickets', query] as const,
  sla: (userId: string, query: AnalyticsQuery) =>
    ['analytics', userId, 'sla', query] as const,
  categories: (userId: string, query: AnalyticsQuery) =>
    ['analytics', userId, 'categories', query] as const,
  agents: (userId: string, query: AnalyticsQuery) =>
    ['analytics', userId, 'agents', query] as const,
};

function useUserId(): string {
  const { user } = useAuth();
  return user?.id ?? 'anonymous';
}

/**
 * True for TeamLead and Administrator only. Decides whether the agent view is
 * OFFERED; the backend's `@Roles(...ANALYTICS_AGENT_ROLES)` guard is what
 * actually enforces it.
 */
export function useCanViewAgentAnalytics(): boolean {
  const { user } = useAuth();
  return user ? isAnalyticsAgentRole(user.role) : false;
}

/*
 * Every hook takes `enabled`: the page passes false for a hidden tab, for a
 * range that could only 400, and (agents) for a role that could only 403.
 * `keepPreviousData` keeps the last figures on screen while a changed filter
 * loads, instead of flashing to a spinner on every keystroke of a date.
 */

export function useTicketAnalytics(query: AnalyticsQuery, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: analyticsKeys.tickets(userId, query),
    queryFn: () => api.getTicketAnalytics(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useSlaAnalytics(query: AnalyticsQuery, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: analyticsKeys.sla(userId, query),
    queryFn: () => api.getSlaAnalytics(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCategoryAnalytics(query: AnalyticsQuery, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: analyticsKeys.categories(userId, query),
    queryFn: () => api.getCategoryAnalytics(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useAgentAnalytics(query: AnalyticsQuery, enabled: boolean) {
  const userId = useUserId();
  const canView = useCanViewAgentAnalytics();
  return useQuery({
    queryKey: analyticsKeys.agents(userId, query),
    queryFn: () => api.getAgentAnalytics(query),
    // Belt and braces on top of the caller's flag: never ask unless the role
    // could be served.
    enabled: enabled && canView,
    placeholderData: keepPreviousData,
  });
}
