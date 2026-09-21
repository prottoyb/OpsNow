import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import { ArticleStatusBadge } from './ArticleStatusBadge';
import { useArticleList, useLinkTicketArticle } from '../useKnowledgeBase';
import { SEARCH_MAX_LENGTH } from '../useArticleListParams';

const SEARCH_DEBOUNCE_MS = 300;

export interface ArticleLinkPickerProps {
  ticketId: string;
  /** Article ids already linked to this ticket — filtered out of results. */
  excludeArticleIds: readonly string[];
  onLinked?: () => void;
  onCancel?: () => void;
}

/**
 * Staff-only search-and-link control for a ticket's knowledge panel, the
 * direct analogue of `AssetLinkPicker`.
 *
 * Results are deliberately NOT restricted to Published articles: staff see
 * every non-deleted article, and linking a Draft is the legitimate "we are
 * writing this up for you" action the backend explicitly allows. The status
 * badge on each result is what keeps that visible rather than hidden.
 */
export function ArticleLinkPicker({
  ticketId,
  excludeArticleIds,
  onLinked,
  onCancel,
}: ArticleLinkPickerProps) {
  const [draft, setDraft] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [linkMessages, setLinkMessages] = useState<string[]>([]);

  useEffect(() => {
    const trimmed = draft.trim().slice(0, SEARCH_MAX_LENGTH);
    const timeout = setTimeout(
      () => setCommittedQuery(trimmed),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timeout);
  }, [draft]);

  const searchQuery = useArticleList(
    { q: committedQuery, limit: 10 },
    committedQuery !== '',
  );
  const linkArticle = useLinkTicketArticle(ticketId);

  const results = (searchQuery.data?.data ?? []).filter(
    (article) => !excludeArticleIds.includes(article.id),
  );

  function handleLink(articleId: string) {
    setLinkMessages([]);
    linkArticle.mutate(articleId, {
      onSuccess: () => {
        setDraft('');
        setCommittedQuery('');
        onLinked?.();
      },
      onError: (error) => setLinkMessages(toApiError(error).messages),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="article-link-search"
          className="text-sm font-medium text-slate-900"
        >
          Search articles
        </label>
        <Input
          id="article-link-search"
          type="search"
          placeholder="Words in the title or body"
          value={draft}
          maxLength={SEARCH_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>

      {committedQuery === '' ? (
        <p className="text-sm text-slate-600">
          Type to search the knowledge base.
        </p>
      ) : null}

      {committedQuery !== '' && searchQuery.isPending ? (
        <Spinner label="Searching articles" />
      ) : null}

      {searchQuery.isError ? (
        <ErrorState
          title="Could not search articles"
          messages={toApiError(searchQuery.error).messages}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : null}

      {committedQuery !== '' && searchQuery.isSuccess && results.length === 0 ? (
        <p className="text-sm text-slate-600">
          No matching articles. Every match may already be linked.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {results.map((article) => (
            <li
              key={article.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {article.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ArticleStatusBadge status={article.status} />
                  <span className="text-xs text-slate-600">
                    {article.category?.name ?? 'Uncategorised'}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                disabled={linkArticle.isPending}
                onClick={() => handleLink(article.id)}
              >
                Link
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Mounted unconditionally; only the text inside is swapped. A live
          region inserted with its content already present is not reliably
          announced (same rationale as `TicketDetailPage`). */}
      <div aria-live="assertive">
        {linkMessages.length > 0 ? (
          <p className="text-sm font-medium text-red-700">
            {linkMessages.join(' ')}
          </p>
        ) : null}
      </div>

      {onCancel ? (
        <div>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
