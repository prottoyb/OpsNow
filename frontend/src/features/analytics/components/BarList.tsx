import { formatCount } from '../analyticsFormat';

export interface BarListItem {
  label: string;
  value: number;
}

export interface BarListProps {
  /** Names the list for assistive tech and is the caption of the figures. */
  label: string;
  /** Plural noun for the accessible value, e.g. "tickets". */
  unit: string;
  items: readonly BarListItem[];
}

/**
 * Proportional horizontal bars in plain HTML/CSS — no charting dependency.
 *
 * Every bar is scaled to the largest value in THIS list, and every figure is
 * also printed as text beside it, so nothing depends on colour or bar length.
 * The bar itself is a `role="meter"` with a name and a value, so a screen
 * reader hears "High: 12 tickets, 40% of the total" rather than silence. One
 * hue throughout: the row label, not the colour, identifies each row.
 */
export function BarList({ label, unit, items }: BarListProps) {
  const max = Math.max(0, ...items.map((item) => item.value));
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => {
          const widthPercent = max === 0 ? 0 : (item.value / max) * 100;
          const share = total === 0 ? 0 : Math.round((item.value / total) * 100);
          return (
            <li
              key={item.label}
              className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm sm:grid-cols-[8rem_1fr_3.5rem]"
            >
              <span className="text-slate-700">{item.label}</span>
              <div className="h-3 rounded-r-sm bg-slate-100">
                <div
                  role="meter"
                  aria-label={`${label}: ${item.label}`}
                  aria-valuemin={0}
                  aria-valuemax={max}
                  aria-valuenow={item.value}
                  aria-valuetext={`${formatCount(item.value)} ${unit}, ${share}% of the total`}
                  className="h-3 rounded-r-sm bg-slate-700"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <span className="text-right font-medium tabular-nums text-slate-900">
                {formatCount(item.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
