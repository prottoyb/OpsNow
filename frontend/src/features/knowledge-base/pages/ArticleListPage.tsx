import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRows } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import { PAGE_SIZE } from '../../../types/api';
import { useAuth, useIsStaff } from '../../auth/useAuth';
import { ArticleFilters } from '../components/ArticleFilters';
import { ArticleList } from '../components/ArticleList';
import { useArticleList, useKnowledgeBaseCategories } from '../useKnowledgeBase';
import { useArticleListParams } from '../useArticleListParams';

export function ArticleListPage() {
  const { user } = useAuth();
  const isStaff = useIsStaff();
  const { filters, query, setFilters, clearFilters, hasActiveFilters } =
    useArticleListParams(user?.id ?? '');

  const articlesQuery = useArticleList(query);
  // `GET /kb-categories` is open to every authenticated role (the taxonomy
  // carries nothing role-sensitive) and the category filter is offered to
  // everyone, so this is fetched unconditionally.
  const categoriesQuery = useKnowledgeBaseCategories();

  const articles = articlesQuery.data?.data ?? [];
  const total = articlesQuery.data?.total ?? 0;

  return (
    <section className="flex flex-col gap-6">
      <PageHeading
        actions={
          isStaff ? (
            <Link
              to="/kb/new"
              className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              New article
            </Link>
          ) : undefined
        }
      >
        Knowledge base
      </PageHeading>

      {/*
        Search and category are offered to every role — self-service search is
        the whole point of the knowledge base for an Employee. Only the status
        and author filters are staff-only (see `ArticleFilters`).
      */}
      <ArticleFilters
        filters={filters}
        categories={categoriesQuery.data ?? []}
        showStaffFilters={isStaff}
        hasActiveFilters={hasActiveFilters}
        onChange={setFilters}
        onClear={clearFilters}
      />

      {articlesQuery.isPending ? (
        <>
          <p role="status" className="text-sm text-slate-600">
            Loading articles…
          </p>
          <SkeletonRows />
        </>
      ) : null}

      {articlesQuery.isError ? (
        <ErrorState
          title="Could not load articles"
          messages={toApiError(articlesQuery.error).messages}
          onRetry={() => void articlesQuery.refetch()}
        />
      ) : null}

      {articlesQuery.isSuccess && articles.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title="No articles match these filters"
            description="Try different words, or widen or clear the filters above."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No articles yet"
            description={
              isStaff
                ? 'Nothing has been written up yet. Start one with “New article”.'
                : 'Nothing has been published to the knowledge base yet.'
            }
          />
        )
      ) : null}

      {articlesQuery.isSuccess && articles.length > 0 ? (
        <>
          {/*
            Status badges are for staff only: an Employee can only ever see
            Published articles, so a badge on every row tells them nothing.
          */}
          <ArticleList articles={articles} showStatus={isStaff} />
          <Pagination
            total={total}
            limit={PAGE_SIZE}
            offset={filters.offset}
            itemNoun="articles"
            onOffsetChange={(offset) => setFilters({ offset })}
          />
        </>
      ) : null}
    </section>
  );
}
