import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  KnowledgeArticleStatus,
  ListArticlesQuery,
} from '../../types/api';
import { KNOWLEDGE_ARTICLE_STATUSES, PAGE_SIZE } from '../../types/api';

/**
 * Two-state, like `AssetListFilters.assignee`: the backend's `authorId` is
 * `@IsOptional() @IsUUID()`, so there is no value meaning "nobody" for the UI
 * to offer. "Mine" is the staff "my drafts" view.
 */
export type ArticleAuthorFilter = 'anyone' | 'me';

export interface ArticleListFilters {
  q?: string;
  categoryId?: string;
  status?: KnowledgeArticleStatus;
  author: ArticleAuthorFilter;
  offset: number;
}

const PARAM = {
  q: 'q',
  category: 'category',
  status: 'status',
  author: 'author',
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
 * Shape-checked for the same reason the enum is: the URL is user-editable and
 * bookmarkable. Forwarding `?category=nonsense` would turn a stale link into a
 * full-page failure showing the raw validator message, instead of simply
 * ignoring a value the UI cannot honour.
 */
function readUuid(raw: string | null): string | undefined {
  return raw && UUID_PATTERN.test(raw) ? raw : undefined;
}

/** Mirrors `ListKnowledgeArticlesQueryDto.q`'s `@MaxLength(200)`. */
export const SEARCH_MAX_LENGTH = 200;

/**
 * Clamped to the backend's own cap so a hand-edited or stale URL can never
 * carry a search term the server would reject outright with a 400.
 */
function readQuery(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  return trimmed.slice(0, SEARCH_MAX_LENGTH);
}

/**
 * An offset large enough to be unusable is treated as page one, and offsets
 * are snapped to a page boundary — same rationale as `useAssetListParams`.
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
 * All filter and pagination state lives in the URL, so a filtered search is
 * shareable, bookmarkable and survives back/forward — mirrors
 * `useAssetListParams`.
 */
export function useArticleListParams(currentUserId: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<ArticleListFilters>(() => {
    return {
      q: readQuery(searchParams.get(PARAM.q)),
      categoryId: readUuid(searchParams.get(PARAM.category)),
      status: readEnum(
        searchParams.get(PARAM.status),
        KNOWLEDGE_ARTICLE_STATUSES,
      ),
      author: searchParams.get(PARAM.author) === 'me' ? 'me' : 'anyone',
      offset: readOffset(searchParams.get(PARAM.offset), PAGE_SIZE),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (next: Partial<ArticleListFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();
      if (merged.q) params.set(PARAM.q, merged.q);
      if (merged.categoryId) params.set(PARAM.category, merged.categoryId);
      if (merged.status) params.set(PARAM.status, merged.status);
      if (merged.author === 'me') params.set(PARAM.author, 'me');
      // Any filter change resets paging unless the caller set offset itself;
      // page 7 of the old filter is meaningless under the new one.
      const offset = next.offset ?? 0;
      if (offset > 0) params.set(PARAM.offset, String(offset));
      /*
       * A change to the debounced free-text `q` REPLACES the current history
       * entry; every other filter pushes a new one — same rationale as
       * `useAssetListParams`: pushing per debounced commit would make typing
       * one search term with two hesitations leave three entries the user has
       * to Back through one keystroke-run at a time.
       */
      const isQueryTextChange =
        next.q !== undefined && Object.keys(next).length === 1;
      setSearchParams(params, { replace: isQueryTextChange });
    },
    [filters, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  const hasActiveFilters =
    filters.q !== undefined ||
    filters.categoryId !== undefined ||
    filters.status !== undefined ||
    filters.author === 'me';

  const query = useMemo<ListArticlesQuery>(
    () => ({
      q: filters.q,
      categoryId: filters.categoryId,
      status: filters.status,
      authorId: filters.author === 'me' ? currentUserId : undefined,
      limit: PAGE_SIZE,
      offset: filters.offset,
    }),
    [filters, currentUserId],
  );

  return { filters, query, setFilters, clearFilters, hasActiveFilters };
}
