import { Link } from 'react-router-dom';
import { CARD_SURFACE_CLASSES } from '../../../components/ui/Card';
import {
  formatDateTime,
  fullName,
  toDateTimeAttribute,
} from '../../../lib/format';
import type { KnowledgeArticleSummary } from '../../../types/api';
import { ArticleStatusBadge } from './ArticleStatusBadge';

const LINK_CLASSES =
  'font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

export interface ArticleListProps {
  articles: readonly KnowledgeArticleSummary[];
  /**
   * The status badge is shown to staff only. An Employee can only ever see
   * Published articles, so a badge reading "Published" on every single row is
   * noise that carries no information for them.
   */
  showStatus: boolean;
}

/**
 * A list of cards rather than a table: a search result is a title, a prose
 * excerpt and some metadata, which does not read as columns and does not fit
 * them at phone width. `TicketTable`/`AssetTable` use a table because their
 * rows genuinely are tabular records.
 *
 * `excerpt` is a plain-text preview built by the backend and is rendered as a
 * React text node, like every other piece of user-authored content here.
 */
export function ArticleList({ articles, showStatus }: ArticleListProps) {
  return (
    // Named so the results are a distinguishable region for assistive tech —
    // the page also carries the filter panel and the main navigation.
    <ul aria-label="Knowledge articles" className="flex flex-col gap-3">
      {articles.map((article) => (
        <li key={article.id} className={CARD_SURFACE_CLASSES}>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/kb/${article.id}`} className={LINK_CLASSES}>
              {article.title}
            </Link>
            {showStatus ? <ArticleStatusBadge status={article.status} /> : null}
          </div>

          {article.excerpt ? (
            <p className="user-content mt-2 text-sm text-slate-700">
              {article.excerpt}
            </p>
          ) : null}

          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <div className="flex gap-1">
              <dt className="font-medium">Category</dt>
              <dd>{article.category?.name ?? 'Uncategorised'}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">Author</dt>
              <dd>{fullName(article.author)}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">Updated</dt>
              <dd>
                <time dateTime={toDateTimeAttribute(article.updatedAt)}>
                  {formatDateTime(article.updatedAt)}
                </time>
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">Views</dt>
              <dd>{article.viewCount}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">Helpful</dt>
              <dd>
                {article.helpfulCount} yes / {article.notHelpfulCount} no
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
