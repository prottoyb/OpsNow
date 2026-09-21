import { EmptyState } from '../../../components/ui/EmptyState';
import { InlineNotice } from '../../../components/ui/ErrorState';
import { formatAverageMinutes, formatCount } from '../analyticsFormat';
import { useCategoryAnalytics } from '../useAnalytics';
import { PanelState } from './PanelState';
import type { AnalyticsPanelProps } from './TicketAnalyticsPanel';
import { WindowCaption } from './WindowCaption';

const UNCATEGORISED_LABEL = 'Uncategorised';

export function CategoryAnalyticsPanel({
  query,
  active,
  rangeError,
}: AnalyticsPanelProps) {
  const result = useCategoryAnalytics(query, active && rangeError === null);
  if (rangeError !== null) return null;

  return (
    <PanelState subject="category statistics" query={result}>
      {(data) => {
        const maxVolume = Math.max(0, ...data.categories.map((c) => c.volume));
        return (
          <div className="flex flex-col gap-4">
            <WindowCaption window={data.window} />

            {data.categories.length === 0 ? (
              <EmptyState
                title="No tickets in this window"
                description="Widen the date range or clear a filter to see category statistics."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Ticket volume and resolution by category, busiest first
                  </caption>
                  <thead>
                    <tr className="border-b border-slate-300 text-slate-700">
                      <th scope="col" className="px-3 py-2 font-semibold">Category</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Volume</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Resolved</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Avg resolution</th>
                      <th scope="col" className="px-3 py-2 font-semibold">SLA breaches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.map((category) => {
                      const name = category.categoryName ?? UNCATEGORISED_LABEL;
                      const width = maxVolume === 0 ? 0 : (category.volume / maxVolume) * 100;
                      return (
                        <tr
                          key={category.categoryId ?? 'uncategorised'}
                          className="border-b border-slate-200 align-middle"
                        >
                          <th scope="row" className="px-3 py-2 font-medium text-slate-800">
                            {name}
                          </th>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-24 rounded-r-sm bg-slate-100">
                                <div
                                  role="meter"
                                  aria-label={`${name} ticket volume`}
                                  aria-valuemin={0}
                                  aria-valuemax={maxVolume}
                                  aria-valuenow={category.volume}
                                  aria-valuetext={`${formatCount(category.volume)} tickets`}
                                  className="h-3 rounded-r-sm bg-slate-700"
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                              <span className="font-medium tabular-nums text-slate-900">
                                {formatCount(category.volume)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-700">
                            {formatCount(category.resolved)}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {formatAverageMinutes(category.avgResolutionMinutes)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-700">
                            {formatCount(category.slaBreaches)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data.truncated ? (
              <InlineNotice>
                Only the busiest categories are shown. Narrow the filters to see
                the rest.
              </InlineNotice>
            ) : null}
          </div>
        );
      }}
    </PanelState>
  );
}
