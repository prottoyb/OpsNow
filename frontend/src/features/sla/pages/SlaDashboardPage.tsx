import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import { formatDurationMinutes } from '../../../lib/format';
import type { SlaMetrics } from '../../../types/api';
import { useIsStaff } from '../../auth/useAuth';
import { useSlaMetrics, useSlaPolicies } from '../useSla';

/**
 * Staff-only SLA overview, built from the two existing read endpoints and
 * nothing else.
 *
 * Deliberately not here, and deliberately not worked around: charts,
 * historical/time-series data, drill-down, policy editing, and an at-risk
 * total. The backend does not compute an at-risk aggregate — at risk is a
 * per-ticket fraction of that ticket's own target, which no single count
 * query can express (ADR-020) — so this page says so plainly rather than
 * inventing a number that would not mean what it appears to mean.
 *
 * The two sections load and fail independently: a failing metrics query must
 * not blank out the policy table, and vice versa.
 */

const METRIC_LABELS: ReadonlyArray<{ key: keyof SlaMetrics; label: string }> = [
  { key: 'openWithSla', label: 'Open tickets with an SLA' },
  {
    key: 'resolutionBreachedInFlight',
    label: 'Resolution overdue (still open)',
  },
  {
    key: 'resolutionBreachedCompleted',
    label: 'Resolution breached (already resolved)',
  },
  { key: 'respondedOnTime', label: 'Responded on time' },
  { key: 'respondedLate', label: 'Responded late' },
  {
    key: 'responseOverdueOutstanding',
    label: 'Response overdue (no reply yet)',
  },
  { key: 'neverResponded', label: 'Resolved with no response' },
];

export function SlaDashboardPage() {
  const isStaff = useIsStaff();
  const metricsQuery = useSlaMetrics(isStaff);
  const policiesQuery = useSlaPolicies(isStaff);

  return (
    <section className="flex flex-col gap-6">
      <PageHeading>SLA</PageHeading>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">
          Service level metrics
        </h2>

        {/*
          `isLoading`, not `isPending`: a DISABLED query stays `pending`
          forever, so a non-staff render that somehow got past the route gate
          would sit under a spinner that never resolves. `isLoading` is
          `pending && fetching`, which is false for a query that was never
          allowed to run.
        */}
        {metricsQuery.isLoading ? <Spinner label="Loading SLA metrics" /> : null}

        {metricsQuery.isError ? (
          <ErrorState
            title="Could not load SLA metrics"
            messages={toApiError(metricsQuery.error).messages}
            onRetry={() => void metricsQuery.refetch()}
          />
        ) : null}

        {metricsQuery.isSuccess ? (
          <>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {METRIC_LABELS.map(({ key, label }) => (
                <div
                  key={key}
                  className="rounded-md border border-slate-200 p-3"
                >
                  <dt className="text-sm text-slate-600">{label}</dt>
                  <dd className="mt-1 text-2xl font-semibold text-slate-900">
                    {metricsQuery.data[key]}
                  </dd>
                </div>
              ))}
            </dl>
            {/*
              Worded so it stays true whatever the backend's at-risk fraction
              is set to — the threshold is deliberately not restated as a
              number anywhere in the frontend.
            */}
            <p className="mt-3 text-xs text-slate-600">
              An at-risk total is not available. At risk is a share of each
              ticket&rsquo;s own target rather than a fixed cutoff, so the
              threshold differs from ticket to ticket and no single count can
              express it. It is reported on each ticket instead.
            </p>
          </>
        ) : null}
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">SLA policies</h2>
        <p className="mt-1 text-xs text-slate-600">
          A ticket keeps the targets that were active when it was created, so
          editing a policy never changes a ticket that already exists.
        </p>

        {/* `isLoading` for the same reason as the metrics section above. */}
        {policiesQuery.isLoading ? (
          <Spinner label="Loading SLA policies" />
        ) : null}

        {policiesQuery.isError ? (
          <ErrorState
            title="Could not load SLA policies"
            messages={toApiError(policiesQuery.error).messages}
            onRetry={() => void policiesQuery.refetch()}
          />
        ) : null}

        {policiesQuery.isSuccess && policiesQuery.data.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No SLA policies are configured"
              description="Tickets created now are not given an SLA at all."
            />
          </div>
        ) : null}

        {policiesQuery.isSuccess && policiesQuery.data.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">SLA policies</caption>
              <thead>
                <tr className="border-b border-slate-300 text-slate-700">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Policy
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Priority
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Response target
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Resolution target
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {policiesQuery.data.map((policy) => (
                  <tr
                    key={policy.id}
                    className="border-b border-slate-200 align-top"
                  >
                    <td className="px-3 py-2 text-slate-800">{policy.name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {policy.priority}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatDurationMinutes(policy.responseTimeMinutes)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatDurationMinutes(policy.resolutionTimeMinutes)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {policy.isActive ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}
