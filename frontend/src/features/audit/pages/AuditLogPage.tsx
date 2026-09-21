import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRows } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import { PAGE_SIZE } from '../../../types/api';
import { AuditFilterBar } from '../components/AuditFilterBar';
import { AuditLogTable } from '../components/AuditLogTable';
import { useAuditLogs } from '../useAudit';
import { useAuditParams } from '../useAuditParams';

/**
 * Administrator-only (the route renders "page not found" for anyone else, and
 * `useAuditLogs` will not fire for a non-Administrator). Read-only: the log is
 * append-only, so nothing here can edit or delete a row.
 */
export function AuditLogPage() {
  const { filters, query, rangeError, setFilters, clearFilters, hasActiveFilters } =
    useAuditParams();
  // An inverted range could only 400, so no request is issued for it.
  const logsQuery = useAuditLogs(query, rangeError === null);

  const entries = logsQuery.data?.data ?? [];
  const total = logsQuery.data?.total ?? 0;
  const error = logsQuery.isError ? toApiError(logsQuery.error) : null;

  return (
    <section className="flex flex-col gap-6">
      <PageHeading>Audit log</PageHeading>

      <AuditFilterBar
        filters={filters}
        rangeError={rangeError}
        hasActiveFilters={hasActiveFilters}
        onChange={setFilters}
        onClear={clearFilters}
      />

      {logsQuery.isLoading ? (
        <>
          <p role="status" className="text-sm text-slate-600">
            Loading audit log…
          </p>
          <SkeletonRows />
        </>
      ) : null}

      {error ? (
        <ErrorState
          title={
            error.isForbidden
              ? 'You do not have access to the audit log'
              : error.isValidationError
                ? 'The filters were not accepted'
                : 'Could not load the audit log'
          }
          messages={error.messages}
          // Retrying a 403 or 400 with the same request cannot change anything.
          onRetry={
            error.isForbidden || error.isValidationError
              ? undefined
              : () => void logsQuery.refetch()
          }
        />
      ) : null}

      {logsQuery.isSuccess && entries.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title="No audit events match these filters"
            description="Widen the date range or clear the filters above."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No audit events yet"
            description="Activity is recorded here as people sign in and work with tickets and assets."
          />
        )
      ) : null}

      {logsQuery.isSuccess && entries.length > 0 ? (
        <>
          <AuditLogTable entries={entries} />
          <Pagination
            total={total}
            limit={PAGE_SIZE}
            offset={filters.offset}
            itemNoun="audit events"
            onOffsetChange={(offset) => setFilters({ offset })}
          />
        </>
      ) : null}
    </section>
  );
}
