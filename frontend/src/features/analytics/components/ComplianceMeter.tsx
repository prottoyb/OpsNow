import { formatCount, formatRate } from '../analyticsFormat';

export interface ComplianceMeterProps {
  /** e.g. "Response SLA compliance". */
  label: string;
  /** 0..1, or null when no clock completed. null is NOT 0. */
  rate: number | null;
  met: number;
  breached: number;
}

/**
 * The two cases are drawn as different things on purpose:
 *
 *   rate === 0    -> "0%", an empty track, and "0 met, N breached": every
 *                    completed clock breached.
 *   rate === null -> "No completed clocks in this window", no meter at all:
 *                    there is nothing to be compliant or non-compliant about.
 *
 * Collapsing null into 0 would show a quiet window as total failure.
 * Colour is not used to judge the number — the figure and the met/breached
 * counts are printed, and the bar is one hue (the brand accent) throughout,
 * never traffic-light red/amber/green: a compliance RATE is a magnitude, not
 * a status, and this bar sits beside real status badges elsewhere on the
 * page that already own the good/warning/critical vocabulary.
 */
export function ComplianceMeter({
  label,
  rate,
  met,
  breached,
}: ComplianceMeterProps) {
  return (
    <div>
      <p className="text-sm text-slate-600">{label}</p>
      {rate === null ? (
        <p className="mt-1 text-base font-medium text-slate-500">
          No completed clocks in this window
        </p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {formatRate(rate)}
          </p>
          <div className="mt-2 h-2.5 rounded-full bg-slate-100">
            <div
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(rate * 100)}
              aria-valuetext={`${formatRate(rate)}, ${formatCount(met)} met and ${formatCount(breached)} breached`}
              className="h-2.5 rounded-full bg-brand-600"
              style={{ width: `${rate * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {formatCount(met)} met, {formatCount(breached)} breached
          </p>
        </>
      )}
    </div>
  );
}
