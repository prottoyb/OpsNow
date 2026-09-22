import type { ReactNode } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { CARD_SURFACE_CLASSES } from '../../../components/ui/Card';

export interface StatTileProps {
  label: string;
  /** The headline figure, already formatted. */
  value: ReactNode;
  /** True when there is no figure to show ("No data"): rendered muted. */
  noData?: boolean;
  /** One line of context under the figure. */
  hint?: string;
  /**
   * True to flag this figure as needing attention right now — a left accent
   * border plus a text badge, never colour alone
   * (`.claude/rules/ui-design.md`). Use only for a figure that is
   * unambiguously bad whenever it is non-zero (e.g. an in-flight SLA
   * breach), not for an ordinary or merely high count.
   */
  emphasis?: boolean;
}

/**
 * One headline number. Must sit inside a `<dl>` (see `StatGrid`), so the
 * label/value pairing is programmatic rather than only visual.
 */
export function StatTile({
  label,
  value,
  noData = false,
  hint,
  emphasis = false,
}: StatTileProps) {
  return (
    <div
      className={`${CARD_SURFACE_CLASSES} ${emphasis ? 'border-l-4 border-l-red-500' : ''}`}
    >
      <dt className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
        {label}
        {emphasis ? <Badge tone="danger">Needs attention</Badge> : null}
      </dt>
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
