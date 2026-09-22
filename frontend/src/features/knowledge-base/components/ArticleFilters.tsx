import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { KnowledgeBaseCategory } from '../../../types/api';
import { KNOWLEDGE_ARTICLE_STATUSES } from '../../../types/api';
import { articleStatusLabel } from '../articleStatus';
import { ArticleCategorySelect } from './ArticleCategorySelect';
import type { ArticleListFilters } from '../useArticleListParams';
import { SEARCH_MAX_LENGTH } from '../useArticleListParams';

export interface ArticleFiltersProps {
  filters: ArticleListFilters;
  categories: readonly KnowledgeBaseCategory[];
  /**
   * Status and "Mine only" are staff-oriented. An Employee only ever sees
   * Published articles, so a status filter could only narrow an already
   * single-status list to nothing, and every article they can see was written
   * by someone else.
   */
  showStaffFilters: boolean;
  hasActiveFilters: boolean;
  onChange: (next: Partial<ArticleListFilters>) => void;
  onClear: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search is offered to every role — self-service search IS the knowledge base
 * for an Employee — while the status and author filters are staff-only.
 */
export function ArticleFilters({
  filters,
  categories,
  showStaffFilters,
  hasActiveFilters,
  onChange,
  onClear,
}: ArticleFiltersProps) {
  // Local, debounced draft so every keystroke does not trigger a request: the
  // committed value (and therefore the URL/query) only updates after a short
  // pause. The cleanup cancels the pending commit, so a component unmounted
  // mid-type never fires a request or sets state after teardown.
  const [searchDraft, setSearchDraft] = useState(filters.q ?? '');

  useEffect(() => {
    setSearchDraft(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const trimmed = searchDraft.trim();
    if (trimmed === (filters.q ?? '')) {
      return;
    }
    const timeout = setTimeout(() => {
      onChange({ q: trimmed || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchDraft, filters.q, onChange]);

  return (
    <Card aria-labelledby="article-filters-heading">
      <h2 id="article-filters-heading" className="sr-only">
        Filter knowledge articles
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="article-filter-q"
            className="text-sm font-medium text-slate-900"
          >
            Search
          </label>
          <Input
            id="article-filter-q"
            type="search"
            placeholder="Words in the title or body"
            value={searchDraft}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="article-filter-category"
            className="text-sm font-medium text-slate-900"
          >
            Category
          </label>
          <ArticleCategorySelect
            id="article-filter-category"
            value={filters.categoryId ?? ''}
            categories={categories}
            noneLabel="Any category"
            onChange={(categoryId) =>
              onChange({ categoryId: categoryId || undefined })
            }
          />
        </div>

        {showStaffFilters ? (
          <>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="article-filter-status"
                className="text-sm font-medium text-slate-900"
              >
                Status
              </label>
              <Select
                id="article-filter-status"
                value={filters.status ?? ''}
                onChange={(event) =>
                  onChange({
                    status: (event.target.value ||
                      undefined) as ArticleListFilters['status'],
                  })
                }
              >
                <option value="">Any status</option>
                {KNOWLEDGE_ARTICLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {articleStatusLabel(status)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-900">Author</span>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.author === 'me'}
                  onChange={(event) =>
                    onChange({ author: event.target.checked ? 'me' : 'anyone' })
                  }
                  className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                />
                Written by me
              </label>
            </div>
          </>
        ) : null}
      </div>

      {hasActiveFilters ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
