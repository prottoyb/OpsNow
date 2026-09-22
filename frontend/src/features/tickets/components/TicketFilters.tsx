import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import type { TicketCategory } from '../../../types/api';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../../types/api';
import { statusLabel } from '../transitions';
import { CategorySelect } from './CategorySelect';
import type { TicketListFilters } from '../useTicketListParams';

export interface TicketFiltersProps {
  filters: TicketListFilters;
  categories: readonly TicketCategory[];
  isStaff: boolean;
  hasActiveFilters: boolean;
  onChange: (next: Partial<TicketListFilters>) => void;
  onClear: () => void;
}

export function TicketFilters({
  filters,
  categories,
  isStaff,
  hasActiveFilters,
  onChange,
  onClear,
}: TicketFiltersProps) {
  return (
    <Card aria-labelledby="ticket-filters-heading">
      <h2 id="ticket-filters-heading" className="sr-only">
        Filter tickets
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-status"
            className="text-sm font-medium text-slate-900"
          >
            Status
          </label>
          <Select
            id="filter-status"
            value={filters.status ?? ''}
            onChange={(event) =>
              onChange({
                status: (event.target.value ||
                  undefined) as TicketListFilters['status'],
              })
            }
          >
            <option value="">Any status</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-priority"
            className="text-sm font-medium text-slate-900"
          >
            Priority
          </label>
          <Select
            id="filter-priority"
            value={filters.priority ?? ''}
            onChange={(event) =>
              onChange({
                priority: (event.target.value ||
                  undefined) as TicketListFilters['priority'],
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
            htmlFor="filter-category"
            className="text-sm font-medium text-slate-900"
          >
            Category
          </label>
          {/* Same grouped picker as the ticket forms — including the rule
              that a parent category stays selectable — rather than a second
              copy of it. */}
          <CategorySelect
            id="filter-category"
            value={filters.categoryId ?? ''}
            categories={categories}
            noneLabel="Any category"
            onChange={(categoryId) =>
              onChange({ categoryId: categoryId || undefined })
            }
          />
        </div>

        {/*
          Hidden for an Employee: the backend already scopes them to their own
          tickets, so an assignee filter would only ever narrow a list they
          cannot widen.
        */}
        {isStaff ? (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="filter-assignee"
              className="text-sm font-medium text-slate-900"
            >
              Assignee
            </label>
            <Select
              id="filter-assignee"
              value={filters.assignee}
              onChange={(event) =>
                onChange({
                  assignee: event.target
                    .value as TicketListFilters['assignee'],
                })
              }
            >
              <option value="anyone">Anyone</option>
              <option value="me">Assigned to me</option>
            </Select>
          </div>
        ) : null}
      </div>

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
