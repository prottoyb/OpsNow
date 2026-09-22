import type { ReactNode } from 'react';

export interface CardProps {
  /** Rendered as the card's own <h2>, not a page-level heading. */
  heading?: ReactNode;
  /** Optional trailing content beside the heading (e.g. an action button). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The shared bounded-content surface (a ticket's Details/Status/Triage/About
 * panels, a filter bar, a stat tile, the AI assistant panel, ...). Replaces
 * the `rounded-md border border-slate-200 bg-white p-4` markup that was
 * previously hand-copied across every feature directory — see
 * `.claude/rules/ui-design.md`'s "reuse before creating" guidance.
 */
export function Card({ heading, actions, children, className = '' }: CardProps) {
  return (
    <section
      className={`rounded-card border border-slate-200 bg-white p-4 shadow-card sm:p-5 ${className}`}
    >
      {heading || actions ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {heading ? (
            <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
          ) : (
            <span />
          )}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
