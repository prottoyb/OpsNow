export interface SpinnerProps {
  label?: string;
}

/**
 * The visual is decorative; the accessible name carries the meaning, so a
 * screen-reader user is told the page is loading rather than nothing at all.
 */
export function Spinner({ label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
      />
      {label}
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading' }: SpinnerProps) {
  return (
    <div className="flex min-h-48 items-center justify-center p-8">
      <Spinner label={label} />
    </div>
  );
}

/** Skeleton rows for a list that is loading for the first time. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-md bg-slate-200" />
      ))}
    </div>
  );
}

/** One pulsing block shaped like a Card, for skeletons that mimic real layout. */
function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse rounded-card border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 h-4 w-1/3 rounded bg-slate-200" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className="h-3 rounded bg-slate-100"
            style={{ width: `${85 - index * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Shaped like the ticket/asset/article detail page it stands in for (a
 * heading, a badge row, a main card and 2–3 aside cards) rather than a
 * generic spinner, so the page does not blank-then-pop once data arrives —
 * see `.claude/rules/ui-design.md`'s "a skeleton, not a blank screen" rule.
 * The pulsing shapes are decorative (`aria-hidden`); `label` carries the same
 * accessible loading announcement `FullPageSpinner` gave via a visually
 * hidden `role="status"` region, so nothing is lost for assistive tech.
 */
export function DetailPageSkeleton({ label = 'Loading' }: SpinnerProps) {
  return (
    <div className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="h-7 w-2/3 max-w-md animate-pulse rounded bg-slate-200 sm:h-8" />
        <div className="flex gap-2">
          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SkeletonCard lines={4} />
          </div>
          <div className="flex flex-col gap-6">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
