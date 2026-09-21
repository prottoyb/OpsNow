import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AnalyticsQuery } from '../../types/api';
import { TICKET_PRIORITIES } from '../../types/api';
import { parseDay, toRequestRange, validateRange } from './analyticsRange';

export const ANALYTICS_TABS = ['tickets', 'sla', 'categories', 'agents'] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

/**
 * Two-state, like the KB list's author filter: `assigneeId` is a UUID and
 * `GET /users` is Administrator-only, so there is no staff directory to pick
 * from. "Me" is the one assignee the UI can honestly offer.
 */
export type AnalyticsAssigneeFilter = 'anyone' | 'me';

export interface AnalyticsFilters {
  /** YYYY-MM-DD, a UTC calendar day. */
  from?: string;
  /** YYYY-MM-DD, a UTC calendar day. */
  to?: string;
  priority?: (typeof TICKET_PRIORITIES)[number];
  categoryId?: string;
  assignee: AnalyticsAssigneeFilter;
}

const PARAM = {
  from: 'from',
  to: 'to',
  priority: 'priority',
  category: 'category',
  assignee: 'assignee',
  tab: 'tab',
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readUuid(raw: string | null): string | undefined {
  return raw && UUID_PATTERN.test(raw) ? raw : undefined;
}

function readPriority(raw: string | null): AnalyticsFilters['priority'] {
  return TICKET_PRIORITIES.find((priority) => priority === raw);
}

/**
 * Filter and tab state lives in the URL so a filtered dashboard is linkable
 * and survives a reload — mirrors `useArticleListParams`. Every value is
 * shape-checked on the way in, since the URL is user-editable.
 *
 * `canViewAgents` gates the agent tab: a `?tab=agents` link opened by a
 * SupportAgent falls back to the first tab rather than asking for a view the
 * backend would 403.
 */
export function useAnalyticsParams(
  currentUserId: string,
  canViewAgents: boolean,
) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<AnalyticsFilters>(
    () => ({
      from: parseDay(searchParams.get(PARAM.from)),
      to: parseDay(searchParams.get(PARAM.to)),
      priority: readPriority(searchParams.get(PARAM.priority)),
      categoryId: readUuid(searchParams.get(PARAM.category)),
      assignee: searchParams.get(PARAM.assignee) === 'me' ? 'me' : 'anyone',
    }),
    [searchParams],
  );

  const tab = useMemo<AnalyticsTab>(() => {
    const raw = ANALYTICS_TABS.find((id) => id === searchParams.get(PARAM.tab));
    if (!raw || (raw === 'agents' && !canViewAgents)) return 'tickets';
    return raw;
  }, [searchParams, canViewAgents]);

  const write = useCallback(
    (next: AnalyticsFilters, nextTab: AnalyticsTab, replace: boolean) => {
      const params = new URLSearchParams();
      if (next.from) params.set(PARAM.from, next.from);
      if (next.to) params.set(PARAM.to, next.to);
      if (next.priority) params.set(PARAM.priority, next.priority);
      if (next.categoryId) params.set(PARAM.category, next.categoryId);
      if (next.assignee === 'me') params.set(PARAM.assignee, 'me');
      if (nextTab !== 'tickets') params.set(PARAM.tab, nextTab);
      setSearchParams(params, { replace });
    },
    [setSearchParams],
  );

  const setFilters = useCallback(
    (next: Partial<AnalyticsFilters>) => write({ ...filters, ...next }, tab, false),
    [filters, tab, write],
  );

  /** Tab switches replace the history entry: they are not a new "search". */
  const setTab = useCallback(
    (next: AnalyticsTab) => write(filters, next, true),
    [filters, write],
  );

  /** Clears the filters but stays on the current tab. */
  const clearFilters = useCallback(
    () => write({ assignee: 'anyone' }, tab, false),
    [tab, write],
  );

  const hasActiveFilters =
    filters.from !== undefined ||
    filters.to !== undefined ||
    filters.priority !== undefined ||
    filters.categoryId !== undefined ||
    filters.assignee === 'me';

  /**
   * Guidance for a range that could only produce a 400 (too wide, or inverted).
   * While set, no analytics request is issued.
   */
  const rangeError = useMemo(
    () => validateRange({ from: filters.from, to: filters.to }),
    [filters.from, filters.to],
  );

  const query = useMemo<AnalyticsQuery>(() => {
    const range = rangeError
      ? {}
      : toRequestRange({ from: filters.from, to: filters.to });
    return {
      ...range,
      priority: filters.priority,
      categoryId: filters.categoryId,
      assigneeId: filters.assignee === 'me' ? currentUserId : undefined,
    };
  }, [filters, rangeError, currentUserId]);

  return {
    filters,
    tab,
    query,
    rangeError,
    setFilters,
    setTab,
    clearFilters,
    hasActiveFilters,
  };
}
