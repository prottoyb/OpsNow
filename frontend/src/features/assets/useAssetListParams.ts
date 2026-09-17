import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AssetStatus, ListAssetsQuery } from '../../types/api';
import { ASSET_STATUSES, PAGE_SIZE } from '../../types/api';

/**
 * The assignee filter is two-state, not three — same rationale as
 * `useTicketListParams`'s `AssigneeFilter`: `ListAssetsQueryDto.assigneeId`
 * is `@IsOptional() @IsUUID()`, so there is no value that means "unassigned"
 * for the UI to offer.
 */
export type AssetAssigneeFilter = 'anyone' | 'me';

export interface AssetListFilters {
  status?: AssetStatus;
  assetTypeId?: string;
  q?: string;
  assignee: AssetAssigneeFilter;
  offset: number;
}

const PARAM = {
  status: 'status',
  assetType: 'assetType',
  q: 'q',
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
 * and bookmarkable. Forwarding `?assetType=nonsense` would turn a stale link
 * into a full-page failure showing the raw validator message, instead of
 * simply ignoring a value the UI cannot honour.
 */
function readUuid(raw: string | null): string | undefined {
  return raw && UUID_PATTERN.test(raw) ? raw : undefined;
}

const MAX_Q_LENGTH = 100;

/**
 * Clamped to the backend's own `@MaxLength(100)` on `ListAssetsQueryDto.q`,
 * so a hand-edited or stale URL can never carry a search term the server
 * would reject outright with a 400.
 */
function readQuery(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  return trimmed.slice(0, MAX_Q_LENGTH);
}

/**
 * An offset large enough to be unusable is treated as page one, and offsets
 * are snapped to a page boundary — same rationale as `useTicketListParams`.
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
 * shareable, bookmarkable and survives back/forward — mirrors
 * `useTicketListParams`.
 */
export function useAssetListParams(currentUserId: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<AssetListFilters>(() => {
    return {
      status: readEnum(searchParams.get(PARAM.status), ASSET_STATUSES),
      assetTypeId: readUuid(searchParams.get(PARAM.assetType)),
      q: readQuery(searchParams.get(PARAM.q)),
      assignee: searchParams.get(PARAM.assignee) === 'me' ? 'me' : 'anyone',
      offset: readOffset(searchParams.get(PARAM.offset), PAGE_SIZE),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (next: Partial<AssetListFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();
      if (merged.status) params.set(PARAM.status, merged.status);
      if (merged.assetTypeId) params.set(PARAM.assetType, merged.assetTypeId);
      if (merged.q) params.set(PARAM.q, merged.q);
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
    filters.assetTypeId !== undefined ||
    filters.q !== undefined ||
    filters.assignee === 'me';

  const query = useMemo<ListAssetsQuery>(
    () => ({
      status: filters.status,
      assetTypeId: filters.assetTypeId,
      assigneeId: filters.assignee === 'me' ? currentUserId : undefined,
      q: filters.q,
      limit: PAGE_SIZE,
      offset: filters.offset,
    }),
    [filters, currentUserId],
  );

  return { filters, query, setFilters, clearFilters, hasActiveFilters };
}
