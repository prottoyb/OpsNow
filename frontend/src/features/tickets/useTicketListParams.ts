import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ListTicketsQuery,
  TicketPriority,
  TicketStatus,
} from '../../types/api';
import { PAGE_SIZE, TICKET_PRIORITIES, TICKET_STATUSES } from '../../types/api';

/**
 * The assignee filter is two-state, not three.
 *
 * `ListTicketsQueryDto.assigneeId` is `@IsOptional() @IsUUID()` — there is no
 * value that means "unassigned", and inventing one (`assigneeId=null`,
 * `unassigned=true`) would be rejected by `forbidNonWhitelisted`. So the UI
 * offers only what the API can actually answer.
 */
export type AssigneeFilter = 'anyone' | 'me';

export interface TicketListFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  categoryId?: string;
  assignee: AssigneeFilter;
  offset: number;
}

const PARAM = {
  status: 'status',
  priority: 'priority',
  category: 'category',
  assignee: 'assignee',
  offset: 'offset',
} as const;

function readEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | undefined {
  return raw && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

/**
 * All filter and pagination state lives in the URL, so a filtered list is
 * shareable, bookmarkable and survives back/forward — and there is no second
 * copy of it in component state to drift out of sync.
 */
export function useTicketListParams(currentUserId: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TicketListFilters>(() => {
    const rawOffset = Number(searchParams.get(PARAM.offset) ?? '0');
    return {
      status: readEnum(searchParams.get(PARAM.status), TICKET_STATUSES),
      priority: readEnum(searchParams.get(PARAM.priority), TICKET_PRIORITIES),
      categoryId: searchParams.get(PARAM.category) ?? undefined,
      assignee: searchParams.get(PARAM.assignee) === 'me' ? 'me' : 'anyone',
      offset:
        Number.isInteger(rawOffset) && rawOffset >= 0
          ? rawOffset
          : 0,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (next: Partial<TicketListFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();
      if (merged.status) params.set(PARAM.status, merged.status);
      if (merged.priority) params.set(PARAM.priority, merged.priority);
      if (merged.categoryId) params.set(PARAM.category, merged.categoryId);
      if (merged.assignee === 'me') params.set(PARAM.assignee, 'me');
      // Any filter change resets paging unless the caller set offset itself;
      // page 7 of the old filter is meaningless under the new one.
      const offset = next.offset ?? 0;
      if (offset > 0) params.set(PARAM.offset, String(offset));
      setSearchParams(params, { replace: false });
    },
    [filters, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  const hasActiveFilters =
    filters.status !== undefined ||
    filters.priority !== undefined ||
    filters.categoryId !== undefined ||
    filters.assignee === 'me';

  const query = useMemo<ListTicketsQuery>(
    () => ({
      status: filters.status,
      priority: filters.priority,
      categoryId: filters.categoryId,
      assigneeId: filters.assignee === 'me' ? currentUserId : undefined,
      limit: PAGE_SIZE,
      offset: filters.offset,
    }),
    [filters, currentUserId],
  );

  return { filters, query, setFilters, clearFilters, hasActiveFilters };
}
