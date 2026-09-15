import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface PageHeadingProps {
  children: ReactNode;
  /** Optional trailing content (actions, badges) shown beside the title. */
  actions?: ReactNode;
}

/**
 * In a single-page app the browser does not move focus on navigation, so a
 * keyboard or screen-reader user would stay parked on the link they just
 * activated. Focusing the new page's <h1> restores the behaviour they get
 * from a full page load. `tabIndex={-1}` makes the heading programmatically
 * focusable without adding it to the tab order.
 */
export function PageHeading({ children, actions }: PageHeadingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 sm:text-2xl"
      >
        {children}
      </h1>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
