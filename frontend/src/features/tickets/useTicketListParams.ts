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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shape-checked for the same reason the enums are: the URL is user-editable
 * and bookmarkable. Forwarding `?category=nonsense` would turn a stale link
 * into a full-page failure showing the raw validator message, instead of
 * simply ignoring a value the UI cannot honour.
 */
function readUuid(raw: string | null): string | undefined {
  return raw && UUID_PATTERN.test(raw) ? raw : undefined;
}

/**
 * An offset large enough to be unusable is treated as page one. `Number`
 * accepts values far beyond `Number.MAX_SAFE_INTEGER` and `Number.isInteger`
 * still reports true for them, so an absurd `?offset=` would otherwise reach
 * the API. Offsets are also snapped to a page boundary, since every control
 * on the page moves in whole pages and a hand-edited offset would otherwise
 * render a half-page window.
 */
const MAX_OFFSET = 1_000_000;

function readOffset(raw: string | null, pageSize: number): number {
  const parsed = Number(raw ?? '0');
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_OFFSET) {
    return 0;
  }
  return Math.floor(parsed / pageSize) * pageSize;
}

/**
 * All filter and pagination state lives in the URL, so a filtered list is
 * shareable, bookmarkable and survives back/forward — and there is no second
 * copy of it in component state to drift out of sync.
 */
export function useTicketListParams(currentUserId: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TicketListFilters>(() => {
    return {
      status: readEnum(searchParams.get(PARAM.status), TICKET_STATUSES),
      priority: readEnum(searchParams.get(PARAM.priority), TICKET_PRIORITIES),
      categoryId: readUuid(searchParams.get(PARAM.category)),
      assignee: searchParams.get(PARAM.assignee) === 'me' ? 'me' : 'anyone',
      offset: readOffset(searchParams.get(PARAM.offset), PAGE_SIZE),
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
