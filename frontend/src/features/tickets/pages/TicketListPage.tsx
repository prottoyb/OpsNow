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
import { TicketFilters } from '../components/TicketFilters';
import { TicketTable } from '../components/TicketTable';
import { useTicketCategories, useTicketList } from '../useTickets';
import { useTicketListParams } from '../useTicketListParams';

export function TicketListPage() {
  const { user } = useAuth();
  const isStaff = useIsStaff();
  const { filters, query, setFilters, clearFilters, hasActiveFilters } =
    useTicketListParams(user?.id ?? '');

  const ticketsQuery = useTicketList(query);
  const categoriesQuery = useTicketCategories();

  const tickets = ticketsQuery.data?.data ?? [];
  const total = ticketsQuery.data?.total ?? 0;

  return (
    <section className="flex flex-col gap-6">
      <PageHeading
        actions={
          <Link
            to="/tickets/new"
            className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            New ticket
          </Link>
        }
      >
        Tickets
      </PageHeading>

      <TicketFilters
        filters={filters}
        categories={categoriesQuery.data ?? []}
        isStaff={isStaff}
        hasActiveFilters={hasActiveFilters}
        onChange={setFilters}
        onClear={clearFilters}
      />

      {ticketsQuery.isPending ? (
        <>
          <p role="status" className="text-sm text-slate-600">
            Loading tickets…
          </p>
          <SkeletonRows />
        </>
      ) : null}

      {ticketsQuery.isError ? (
        <ErrorState
          title="Could not load tickets"
          messages={toApiError(ticketsQuery.error).messages}
          onRetry={() => void ticketsQuery.refetch()}
        />
      ) : null}

      {ticketsQuery.isSuccess && tickets.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title="No tickets match these filters"
            description="Try widening or clearing the filters above."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No tickets yet"
            description={
              isStaff
                ? 'Nothing has been raised yet.'
                : 'You have not raised any tickets yet.'
            }
            action={
              <Link
                to="/tickets/new"
                className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Raise your first ticket
              </Link>
            }
          />
        )
      ) : null}

      {ticketsQuery.isSuccess && tickets.length > 0 ? (
        <>
          <TicketTable tickets={tickets} />
          <Pagination
            total={total}
            limit={PAGE_SIZE}
            offset={filters.offset}
            itemNoun="tickets"
            onOffsetChange={(offset) => setFilters({ offset })}
          />
        </>
      ) : null}
    </section>
  );
}
