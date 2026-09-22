import { Card } from '../../../components/ui/Card';
import type { SlaClockAnalytics } from '../../../types/api';
import { formatCount } from '../analyticsFormat';
import { useSlaAnalytics } from '../useAnalytics';
import { ComplianceMeter } from './ComplianceMeter';
import { PanelState } from './PanelState';
import { StatGrid, StatTile } from './StatTile';
import type { AnalyticsPanelProps } from './TicketAnalyticsPanel';
import { WindowCaption } from './WindowCaption';

/**
 * Every figure here is rendered exactly as the backend computed it. Whether a
 * clock is met, breached or at risk is the backend's call (ADR-021); nothing
 * on this page compares a due date with the browser clock.
 */
function ClockCard({
  title,
  clock,
}: {
  title: string;
  clock: SlaClockAnalytics;
}) {
  return (
    <Card heading={title} className="flex flex-col gap-4">
      <ComplianceMeter
        label={`${title} SLA compliance`}
        rate={clock.complianceRate}
        met={clock.met}
        breached={clock.breached}
      />
      <StatGrid>
        <StatTile
          label="Breached (completed)"
          value={formatCount(clock.breached)}
          hint="Finished after the target."
        />
        <StatTile
          label="Overdue (still open)"
          value={formatCount(clock.inFlightBreached)}
          hint="Running clocks already past due."
        />
        <StatTile
          label="At risk"
          value={formatCount(clock.atRisk)}
          hint="Running, not yet late, nearly out of time. Paused clocks are never at risk."
        />
      </StatGrid>
    </Card>
  );
}

export function SlaAnalyticsPanel({
  query,
  active,
  rangeError,
}: AnalyticsPanelProps) {
  const result = useSlaAnalytics(query, active && rangeError === null);
  if (rangeError !== null) return null;

  return (
    <PanelState subject="SLA analytics" query={result}>
      {(data) => (
        <div className="flex flex-col gap-6">
          <WindowCaption window={data.window} />
          <dl>
            <StatTile
              label="Tickets created in window with an SLA"
              value={formatCount(data.ticketsWithSla)}
            />
          </dl>
          <div className="grid gap-4 lg:grid-cols-2">
            <ClockCard title="Response" clock={data.response} />
            <ClockCard title="Resolution" clock={data.resolution} />
          </div>
          <p className="text-xs text-slate-600">
            Compliance is met clocks out of completed clocks. When no clock has
            completed there is no rate, which is shown as &ldquo;No completed
            clocks&rdquo; rather than 0%.
          </p>
        </div>
      )}
    </PanelState>
  );
}
