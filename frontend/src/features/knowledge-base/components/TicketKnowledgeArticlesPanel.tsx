import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import type { TicketKnowledgeArticle } from '../../../types/api';
import { useIsStaff } from '../../auth/useAuth';
import { ArticleLinkPicker } from './ArticleLinkPicker';
import { ArticleStatusBadge } from './ArticleStatusBadge';
import { useTicketArticles, useUnlinkTicketArticle } from '../useKnowledgeBase';

const LINK_CLASSES =
  'font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

function TicketArticleRow({
  ticketId,
  link,
}: {
  ticketId: string;
  link: TicketKnowledgeArticle;
}) {
  const isStaff = useIsStaff();
  const { article } = link;
  const unlinkArticle = useUnlinkTicketArticle(ticketId);
  const [messages, setMessages] = useState<string[]>([]);

  function handleUnlink() {
    setMessages([]);
    unlinkArticle.mutate(article.id, {
      onError: (error) => setMessages(toApiError(error).messages),
    });
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      {/*
        Hyperlinked for EVERY role, unlike `TicketAssetsPanel`'s rows.
        `GET /tickets/:id/knowledge-articles` is already scoped to the
        caller's article visibility, so an Employee is only ever shown links
        to Published articles — which `GET /kb-articles/:id` will then serve
        them. There is no way for this panel to hand someone a link that
        lands on a 404, which is exactly the problem the asset panel has.
      */}
      <Link to={`/kb/${article.id}`} className={LINK_CLASSES}>
        {article.title}
      </Link>

      {/* Staff only: an Employee is only ever shown Published articles, so
          the badge would be a constant. */}
      {isStaff ? (
        <div className="mt-1">
          <ArticleStatusBadge status={article.status} />
        </div>
      ) : null}

      {isStaff ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={unlinkArticle.isPending}
            onClick={handleUnlink}
          >
            Unlink
          </Button>
        </div>
      ) : null}

      {/* Mounted unconditionally; only the text inside is swapped. A live
          region inserted with its content already present is not reliably
          announced (same rationale as `TicketDetailPage`). */}
      <div aria-live="assertive">
        {messages.length > 0 ? (
          <p className="mt-2 text-sm font-medium text-red-700">
            {messages.join(' ')}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export interface TicketKnowledgeArticlesPanelProps {
  ticketId: string;
}

/**
 * The ticket detail page's linked knowledge-articles panel, the direct
 * analogue of `TicketAssetsPanel`.
 *
 * `GET /tickets/:id/knowledge-articles` is readable by anyone who can already
 * see the ticket, so the query itself always runs; what differs by role is
 * what is offered on top of the same rows. Linking and unlinking are both
 * idempotent on the backend, so a double-click or a re-link of something
 * already attached is a no-op rather than an error or a duplicate row.
 */
export function TicketKnowledgeArticlesPanel({
  ticketId,
}: TicketKnowledgeArticlesPanelProps) {
  const isStaff = useIsStaff();
  const ticketArticlesQuery = useTicketArticles(ticketId);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <Card heading="Knowledge articles">
      <div className="flex flex-col gap-3">
        {ticketArticlesQuery.isPending ? (
          <Spinner label="Loading linked articles" />
        ) : null}

        {ticketArticlesQuery.isError ? (
          <ErrorState
            title="Could not load linked articles"
            messages={toApiError(ticketArticlesQuery.error).messages}
            onRetry={() => void ticketArticlesQuery.refetch()}
          />
        ) : null}

        {ticketArticlesQuery.isSuccess &&
        ticketArticlesQuery.data.length === 0 ? (
          <p className="text-sm text-slate-600">
            No knowledge articles are linked to this ticket.
          </p>
        ) : null}

        {ticketArticlesQuery.isSuccess && ticketArticlesQuery.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {ticketArticlesQuery.data.map((link) => (
              <TicketArticleRow
                key={link.article.id}
                ticketId={ticketId}
                link={link}
              />
            ))}
          </ul>
        ) : null}

        {isStaff ? (
          pickerOpen ? (
            <ArticleLinkPicker
              ticketId={ticketId}
              excludeArticleIds={(ticketArticlesQuery.data ?? []).map(
                (link) => link.article.id,
              )}
              onLinked={() => setPickerOpen(false)}
              onCancel={() => setPickerOpen(false)}
            />
          ) : (
            <div>
              <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                Link an article
              </Button>
            </div>
          )
        ) : null}
      </div>
    </Card>
  );
}
