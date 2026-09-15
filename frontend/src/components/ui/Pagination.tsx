import { Button } from './Button';

export interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  /** Used in the accessible label, e.g. "tickets". */
  itemNoun?: string;
}

export function Pagination({
  total,
  limit,
  offset,
  onOffsetChange,
  itemNoun = 'results',
}: PaginationProps) {
  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <nav
      aria-label={`${itemNoun} pagination`}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {/* Announced on change so a screen-reader user hears the new range. */}
      <p aria-live="polite" className="text-sm text-slate-600">
        {total === 0
          ? `No ${itemNoun}`
          : `Showing ${first}–${last} of ${total} ${itemNoun} (page ${page} of ${pageCount})`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={offset + limit >= total}
          onClick={() => onOffsetChange(offset + limit)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
