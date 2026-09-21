import { formatDate } from '../../../lib/format';
import type { AnalyticsWindow } from '../../../types/api';

/**
 * The window the BACKEND actually used, not the filter the user typed: with no
 * dates chosen the backend applies its own default (the last 30 days), and
 * showing its answer means the page never has to guess what that was.
 */
export function WindowCaption({ window }: { window: AnalyticsWindow }) {
  return (
    <p className="text-xs text-slate-600">
      Window: {formatDate(window.from)} to {formatDate(window.to)} (UTC, both
      days included)
    </p>
  );
}
