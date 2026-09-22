import { EmptyState } from '../../../components/ui/EmptyState';
import { InlineNotice } from '../../../components/ui/ErrorState';
import {
  formatAverageMinutes,
  formatCount,
  formatRate,
} from '../analyticsFormat';
import { useAgentAnalytics } from '../useAnalytics';
import { PanelState } from './PanelState';
import type { AnalyticsPanelProps } from './TicketAnalyticsPanel';
import { WindowCaption } from './WindowCaption';

/**
 * Only mounted for TeamLead and Administrator (the page does not offer this
 * tab to anyone else), and `useAgentAnalytics` independently refuses to fire
 * for any other role. Both are only about not making a guaranteed 403; the
 * backend guard is the enforcement.
 */
export function AgentAnalyticsPanel({
  query,
  active,
  rangeError,
}: AnalyticsPanelProps) {
  const result = useAgentAnalytics(query, active && rangeError === null);
  if (rangeError !== null) return null;

  return (
    <PanelState subject="agent performance" query={result}>
      {(data) => (
        <div className="flex flex-col gap-4">
          <WindowCaption window={data.window} />

          {data.agents.length === 0 ? (
            <EmptyState
              title="No assigned tickets in this window"
              description="Widen the date range or clear a filter to see agent performance."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Tickets assigned and resolved per agent, busiest first
                </caption>
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    <th scope="col" className="px-3 py-2.5">Agent</th>
                    <th scope="col" className="px-3 py-2.5">Assigned</th>
                    <th scope="col" className="px-3 py-2.5">Resolved (of tickets created in window)</th>
                    <th scope="col" className="px-3 py-2.5">Avg resolution</th>
                    <th scope="col" className="px-3 py-2.5">SLA compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.agents.map((agent) => (
                    <tr
                      key={agent.agentId}
                      className="align-top transition-colors hover:bg-slate-50"
                    >
                      <th scope="row" className="px-3 py-3 font-medium text-slate-800">
                        {agent.agentName}
                      </th>
                      <td className="px-3 py-3 tabular-nums text-slate-700">
                        {formatCount(agent.assigned)}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-700">
                        {formatCount(agent.resolved)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatAverageMinutes(agent.avgResolutionMinutes)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {/* null (nothing resolved) is not 0% (all breached). */}
                        {agent.slaComplianceRate === null ? (
                          <span className="text-slate-500">
                            No resolved tickets
                          </span>
                        ) : (
                          <>
                            <span className="font-medium tabular-nums text-slate-900">
                              {formatRate(agent.slaComplianceRate)}
                            </span>
                            <span className="block text-xs text-slate-600">
                              {formatCount(agent.resolutionMet)} met,{' '}
                              {formatCount(agent.resolutionBreached)} breached
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.truncated ? (
            <InlineNotice>
              Only the agents with the most tickets are shown. Narrow the
              filters to see the rest.
            </InlineNotice>
          ) : null}
        </div>
      )}
    </PanelState>
  );
}
