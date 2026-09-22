import { useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/**
 * The card surface's own classes, exported for the handful of list rows
 * (history entries, mobile ticket/asset cards, ...) that need the identical
 * visual treatment but must stay a semantic `<li>`, not a nested `<section>`.
 */
export const CARD_SURFACE_CLASSES =
  'rounded-card border border-slate-200 bg-white p-4 shadow-card';

export interface CardProps extends ComponentPropsWithoutRef<'section'> {
  /** Rendered as the card's own visible <h2>, not a page-level heading. */
  heading?: ReactNode;
  /** Optional trailing content beside the heading (e.g. an action button). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The shared bounded-content surface (a ticket's Details/Status/Triage/About
 * panels, a filter bar, a stat tile, the AI assistant panel, ...). Replaces
 * the `rounded-md border border-slate-200 bg-white p-4` markup that was
 * previously hand-copied across every feature directory — see
 * `.claude/rules/ui-design.md`'s "reuse before creating" guidance.
 *
 * `heading` renders a visible title AND automatically labels the `<section>`
 * as an accessible region via `aria-labelledby` (pass your own
 * `aria-labelledby` to override). A filter bar that only needs an
 * `aria-labelledby`/visually-hidden heading for assistive tech should omit
 * `heading`, render its own `sr-only` heading as a child, and pass its id as
 * `aria-labelledby` directly — every other prop (`id`, ...) passes through to
 * the underlying `<section>`.
 */
export function Card({
  heading,
  actions,
  children,
  className = '',
  'aria-labelledby': ariaLabelledBy,
  ...rest
}: CardProps) {
  const generatedId = useId();
  const headingId = heading ? `${generatedId}-card-heading` : undefined;

  return (
    <section
      aria-labelledby={ariaLabelledBy ?? headingId}
      className={`${CARD_SURFACE_CLASSES} sm:p-5 ${className}`}
      {...rest}
    >
      {heading || actions ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {heading ? (
            <h2 id={headingId} className="text-base font-semibold text-slate-900">
              {heading}
            </h2>
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
