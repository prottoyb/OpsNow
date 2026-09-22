import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { TicketCategory } from '../../../types/api';
import { TICKET_PRIORITIES } from '../../../types/api';
import { CategorySelect } from '../../tickets/components/CategorySelect';
import { todayUtcDay } from '../../../lib/utcDays';
import type { AnalyticsFilters } from '../useAnalyticsParams';

export interface AnalyticsFilterBarProps {
  filters: AnalyticsFilters;
  categories: readonly TicketCategory[];
  /** Guidance for a range that cannot be requested; null when it is fine. */
  rangeError: string | null;
  hasActiveFilters: boolean;
  onChange: (next: Partial<AnalyticsFilters>) => void;
  onClear: () => void;
}

const RANGE_ERROR_ID = 'analytics-range-error';

/**
 * The shared filter bar. Every control commits straight to the URL (there is
 * no free text to debounce), so a filtered dashboard is linkable.
 *
 * Assignee is only ever "anyone" or "me": `assigneeId` is a UUID and the only
 * endpoint that lists users, `GET /users`, is Administrator-only, so no staff
 * directory exists for a TeamLead or SupportAgent to pick a colleague from.
 * Offering a free-text UUID box would not be a usable control.
 */
export function AnalyticsFilterBar({
  filters,
  categories,
  rangeError,
  hasActiveFilters,
  onChange,
  onClear,
}: AnalyticsFilterBarProps) {
  const today = todayUtcDay();
  return (
    <Card aria-labelledby="analytics-filters-heading">
      <h2 id="analytics-filters-heading" className="sr-only">
        Filter analytics
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="analytics-filter-from"
            className="text-sm font-medium text-slate-900"
          >
            From
          </label>
          <Input
            id="analytics-filter-from"
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? today}
            aria-invalid={rangeError !== null}
            aria-describedby={rangeError ? RANGE_ERROR_ID : undefined}
            onChange={(event) =>
              onChange({ from: event.target.value || undefined })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="analytics-filter-to"
            className="text-sm font-medium text-slate-900"
          >
            To
          </label>
          <Input
            id="analytics-filter-to"
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            max={today}
            aria-invalid={rangeError !== null}
            aria-describedby={rangeError ? RANGE_ERROR_ID : undefined}
            onChange={(event) =>
              onChange({ to: event.target.value || undefined })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="analytics-filter-priority"
            className="text-sm font-medium text-slate-900"
          >
            Priority
          </label>
          <Select
            id="analytics-filter-priority"
            value={filters.priority ?? ''}
            onChange={(event) =>
              onChange({
                priority: (event.target.value ||
                  undefined) as AnalyticsFilters['priority'],
              })
            }
          >
            <option value="">Any priority</option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="analytics-filter-category"
            className="text-sm font-medium text-slate-900"
          >
            Category
          </label>
          <CategorySelect
            id="analytics-filter-category"
            value={filters.categoryId ?? ''}
            categories={categories}
            noneLabel="Any category"
            onChange={(categoryId) =>
              onChange({ categoryId: categoryId || undefined })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-900">Assignee</span>
          <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={filters.assignee === 'me'}
              onChange={(event) =>
                onChange({ assignee: event.target.checked ? 'me' : 'anyone' })
              }
              className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            />
            Assigned to me
          </label>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Dates are UTC days, both included, and a range can span at most 366
        days. With no dates the last 30 days are shown. Only your own tickets
        can be picked as an assignee: there is no staff directory to choose
        colleagues from.
      </p>

      {rangeError ? (
        <p
          id={RANGE_ERROR_ID}
          role="alert"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {rangeError}
        </p>
      ) : null}

      {hasActiveFilters ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
