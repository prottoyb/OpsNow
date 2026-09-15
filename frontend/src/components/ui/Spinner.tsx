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
