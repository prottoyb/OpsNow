import type { AnalyticsQuery } from '../../../types/api';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../../types/api';
import { formatAverageMinutes, formatCount } from '../analyticsFormat';
import { useTicketAnalytics } from '../useAnalytics';
import { BarList } from './BarList';
import { PanelState } from './PanelState';
import { StatGrid, StatTile } from './StatTile';
import { WindowCaption } from './WindowCaption';

export interface AnalyticsPanelProps {
  query: AnalyticsQuery;
  /** False for a hidden tab: nothing is requested until it is shown. */
  active: boolean;
  /** Set while the chosen range could only 400; nothing is requested. */
  rangeError: string | null;
}

/** "InProgress" -> "In progress", for display only. */
function statusLabel(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function TicketAnalyticsPanel({
  query,
  active,
  rangeError,
}: AnalyticsPanelProps) {
  const result = useTicketAnalytics(query, active && rangeError === null);
  if (rangeError !== null) return null;

  return (
    <PanelState subject="ticket analytics" query={result}>
      {(data) => {
        const { resolution } = data;
        const noneResolved = resolution.meanMinutes === null;
        return (
          <div className="flex flex-col gap-6">
            <WindowCaption window={data.window} />

            <StatGrid>
              <StatTile
                label="Tickets created in window"
                value={formatCount(data.opened)}
              />
              <StatTile
                label="Tickets resolved in window"
                value={formatCount(data.resolved)}
                hint="Whenever they were created."
              />
              <StatTile
                label="Current backlog"
                value={formatCount(data.backlog)}
                hint="New, open, in progress or on hold right now. Not limited to the window."
              />
              <StatTile
                label="All matching tickets"
                value={formatCount(data.total)}
                hint="Regardless of the window."
              />
            </StatGrid>

            <section aria-labelledby="resolution-heading" className="flex flex-col gap-3">
              <h3 id="resolution-heading" className="text-sm font-semibold text-slate-900">
                Time to resolution
              </h3>
              <StatGrid>
                <StatTile
                  label="Mean resolution time"
                  value={formatAverageMinutes(resolution.meanMinutes)}
                  noData={resolution.meanMinutes === null}
                  hint={
                    noneResolved
                      ? 'Nothing was resolved in this window.'
                      : `Over ${formatCount(resolution.resolvedCount)} resolved tickets.`
                  }
                />
                <StatTile
                  label="Median resolution time"
                  value={formatAverageMinutes(resolution.medianMinutes)}
                  noData={resolution.medianMinutes === null}
                  hint={
                    resolution.medianMinutes === null
                      ? 'Not available until a ticket is resolved.'
                      : 'Half of resolved tickets took less than this.'
                  }
                />
              </StatGrid>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <BarList
                label="Tickets by status"
                unit="tickets"
                items={TICKET_STATUSES.map((status) => ({
                  label: statusLabel(status),
                  value: data.byStatus[status],
                }))}
              />
              <BarList
                label="Tickets by priority"
                unit="tickets"
                items={TICKET_PRIORITIES.map((priority) => ({
                  label: priority,
                  value: data.byPriority[priority],
                }))}
              />
            </div>
            <p className="text-xs text-slate-600">
              Status and priority count the tickets created in the window, by
              their current status.
            </p>
          </div>
        );
      }}
    </PanelState>
  );
}
