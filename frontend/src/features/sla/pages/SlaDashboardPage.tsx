import { Card } from '../../../components/ui/Card';
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

type MetricTone = 'neutral' | 'good' | 'bad';

interface MetricDefinition {
  key: keyof SlaMetrics;
  label: string;
  tone: MetricTone;
}

const RESPONSE_METRICS: readonly MetricDefinition[] = [
  { key: 'respondedOnTime', label: 'Responded on time', tone: 'good' },
  { key: 'respondedLate', label: 'Responded late', tone: 'bad' },
  {
    key: 'responseOverdueOutstanding',
    label: 'Response overdue (no reply yet)',
    tone: 'bad',
  },
  { key: 'neverResponded', label: 'Resolved with no response', tone: 'bad' },
];

const RESOLUTION_METRICS: readonly MetricDefinition[] = [
  {
    key: 'resolutionBreachedInFlight',
    label: 'Resolution overdue (still open)',
    tone: 'bad',
  },
  {
    key: 'resolutionBreachedCompleted',
    label: 'Resolution breached (already resolved)',
    tone: 'bad',
  },
];

/**
 * A small shape-coded glyph beside each tile's label — never the only signal
 * (the label text and the tone-neutral figure itself always stand on their
 * own), but a second, non-colour cue that a "bad" tile is bad at a glance,
 * the same "never colour alone" principle `Badge` already applies. `good`
 * gets a check, `bad` a triangle; `neutral` (the lead figure) gets none.
 *
 * `bad` uses red/danger, not amber/warning: every tile tagged `bad` here
 * (late/overdue/never-responded/breached) represents a completed or
 * in-flight BREACH, not a merely at-risk-but-not-yet-late state — the same
 * distinction `slaDisplay.ts` already draws (`Breached` -> `danger`,
 * `AtRisk` -> `warning`). Matching that vocabulary here, rather than
 * introducing a second meaning for amber, is the point.
 */
function MetricToneGlyph({ tone }: { tone: MetricTone }) {
  if (tone === 'neutral') return null;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-3.5 ${tone === 'good' ? 'text-emerald-700' : 'text-red-700'}`}
    >
      {tone === 'good' ? (
        <path d="M5 12l4 4 10-10" />
      ) : (
        <path d="M12 4l9 16H3L12 4zm0 6v4m0 3h.01" />
      )}
    </svg>
  );
}

function MetricTile({ definition, value }: { definition: MetricDefinition; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <dt className="flex items-center gap-1.5 text-sm text-slate-600">
        <MetricToneGlyph tone={definition.tone} />
        {definition.label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function SlaDashboardPage() {
  const isStaff = useIsStaff();
  const metricsQuery = useSlaMetrics(isStaff);
  const policiesQuery = useSlaPolicies(isStaff);

  return (
    <section className="flex flex-col gap-6">
      <PageHeading>SLA</PageHeading>

      <Card heading="Service level metrics">
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
          <div className="flex flex-col gap-6">
            {/* The lead figure stands alone — it isn't a response or
                resolution count, it's the denominator both groups below are
                drawn from. */}
            <dl>
              <div className="max-w-xs rounded-md border border-slate-200 bg-slate-50 p-4">
                <dt className="text-sm text-slate-600">
                  Open tickets with an SLA
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900">
                  {metricsQuery.data.openWithSla}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Response
              </h3>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {RESPONSE_METRICS.map((definition) => (
                  <MetricTile
                    key={definition.key}
                    definition={definition}
                    value={metricsQuery.data[definition.key]}
                  />
                ))}
              </dl>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Resolution
              </h3>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {RESOLUTION_METRICS.map((definition) => (
                  <MetricTile
                    key={definition.key}
                    definition={definition}
                    value={metricsQuery.data[definition.key]}
                  />
                ))}
              </dl>
            </div>

            {/*
              Worded so it stays true whatever the backend's at-risk fraction
              is set to — the threshold is deliberately not restated as a
              number anywhere in the frontend.
            */}
            <p className="text-xs text-slate-600">
              An at-risk total is not available. At risk is a share of each
              ticket&rsquo;s own target rather than a fixed cutoff, so the
              threshold differs from ticket to ticket and no single count can
              express it. It is reported on each ticket instead.
            </p>
          </div>
        ) : null}
      </Card>

      <Card heading="SLA policies">
        <p className="mb-3 text-xs text-slate-600">
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
          <div className="mt-3 overflow-x-auto rounded-card border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">SLA policies</caption>
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  <th scope="col" className="px-3 py-2.5">
                    Policy
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Priority
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Response target
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Resolution target
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {policiesQuery.data.map((policy) => (
                  <tr
                    key={policy.id}
                    className="align-top transition-colors hover:bg-slate-50"
                  >
                    <td className="px-3 py-3 text-slate-800">{policy.name}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {policy.priority}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatDurationMinutes(policy.responseTimeMinutes)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {formatDurationMinutes(policy.resolutionTimeMinutes)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {policy.isActive ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
