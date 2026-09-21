import type { ReactNode } from 'react';

export interface StatTileProps {
  label: string;
  /** The headline figure, already formatted. */
  value: ReactNode;
  /** True when there is no figure to show ("No data"): rendered muted. */
  noData?: boolean;
  /** One line of context under the figure. */
  hint?: string;
}

/**
 * One headline number. Must sit inside a `<dl>` (see `StatGrid`), so the
 * label/value pairing is programmatic rather than only visual.
 */
export function StatTile({ label, value, noData = false, hint }: StatTileProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd
        className={
          noData
            ? 'mt-1 text-base font-medium text-slate-500'
            : 'mt-1 text-2xl font-semibold tabular-nums text-slate-900'
        }
      >
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
  );
}
