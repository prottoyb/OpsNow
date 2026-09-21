import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  AuditActionName,
  AuditEntityType,
  AuditOutcome,
  ListAuditLogsQuery,
} from '../../types/api';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_OUTCOMES,
  PAGE_SIZE,
} from '../../types/api';
import { dayEndIso, dayStartIso, parseDay } from '../analytics/analyticsRange';

export interface AuditFilters {
  actorId?: string;
  action?: AuditActionName;
  entityType?: AuditEntityType;
  entityId?: string;
  outcome?: AuditOutcome;
  /** YYYY-MM-DD, a UTC calendar day. */
  from?: string;
  /** YYYY-MM-DD, a UTC calendar day. */
  to?: string;
  offset: number;
}

const PARAM = {
  actor: 'actor',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  outcome: 'outcome',
  from: 'from',
  to: 'to',
  offset: 'offset',
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(raw: string): boolean {
  return UUID_PATTERN.test(raw);
}

function readUuid(raw: string | null): string | undefined {
  return raw && isUuid(raw) ? raw : undefined;
}

function readEnum<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | undefined {
  return raw && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

const MAX_OFFSET = 1_000_000;

/** Same rule as the other list pages: unusable offsets are page one. */
function readOffset(raw: string | null, pageSize: number): number {
  const parsed = Number(raw ?? '0');
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_OFFSET) {
    return 0;
  }
  return Math.floor(parsed / pageSize) * pageSize;
}

export const RANGE_ORDER_MESSAGE =
  'The start date must not be after the end date.';

/**
 * All filter and paging state lives in the URL, so a filtered view is
 * linkable and survives a reload — mirrors `useAnalyticsParams` and
 * `useArticleListParams`. Every value is shape-checked on the way in, since
 * the URL is user-editable: a malformed value is ignored rather than
 * forwarded to become a 400.
 */
export function useAuditParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<AuditFilters>(
    () => ({
      actorId: readUuid(searchParams.get(PARAM.actor)),
      action: readEnum(searchParams.get(PARAM.action), AUDIT_ACTIONS),
      entityType: readEnum(
        searchParams.get(PARAM.entityType),
        AUDIT_ENTITY_TYPES,
      ),
      entityId: readUuid(searchParams.get(PARAM.entityId)),
      outcome: readEnum(searchParams.get(PARAM.outcome), AUDIT_OUTCOMES),
      from: parseDay(searchParams.get(PARAM.from)),
      to: parseDay(searchParams.get(PARAM.to)),
      offset: readOffset(searchParams.get(PARAM.offset), PAGE_SIZE),
    }),
    [searchParams],
  );

  const setFilters = useCallback(
    (next: Partial<AuditFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();
      if (merged.actorId) params.set(PARAM.actor, merged.actorId);
      if (merged.action) params.set(PARAM.action, merged.action);
      if (merged.entityType) params.set(PARAM.entityType, merged.entityType);
      if (merged.entityId) params.set(PARAM.entityId, merged.entityId);
      if (merged.outcome) params.set(PARAM.outcome, merged.outcome);
      if (merged.from) params.set(PARAM.from, merged.from);
      if (merged.to) params.set(PARAM.to, merged.to);
      // A filter change resets paging unless the caller set the offset itself.
      const offset = next.offset ?? 0;
      if (offset > 0) params.set(PARAM.offset, String(offset));
      setSearchParams(params, { replace: false });
    },
    [filters, setSearchParams],
  );

  const clearFilters = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: false }),
    [setSearchParams],
  );

  const hasActiveFilters =
    filters.actorId !== undefined ||
    filters.action !== undefined ||
    filters.entityType !== undefined ||
    filters.entityId !== undefined ||
    filters.outcome !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined;

  /** An inverted range could only produce a 400; no request is issued. */
  const rangeError =
    filters.from && filters.to && filters.from > filters.to
      ? RANGE_ORDER_MESSAGE
      : null;

  const query = useMemo<ListAuditLogsQuery>(
    () => ({
      actorId: filters.actorId,
      action: filters.action,
      entityType: filters.entityType,
      entityId: filters.entityId,
      outcome: filters.outcome,
      from: filters.from ? dayStartIso(filters.from) : undefined,
      to: filters.to ? dayEndIso(filters.to) : undefined,
      limit: PAGE_SIZE,
      offset: filters.offset,
    }),
    [filters],
  );

  return {
    filters,
    query,
    rangeError,
    setFilters,
    clearFilters,
    hasActiveFilters,
  };
}
