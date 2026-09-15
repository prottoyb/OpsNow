import { Select } from '../../../components/ui/Select';
import type { TicketPriority } from '../../../types/api';
import { TICKET_PRIORITIES } from '../../../types/api';

export interface PriorityControlProps {
  priority: TicketPriority;
  submitting: boolean;
  onChange: (priority: TicketPriority) => void;
}

/**
 * Staff only — `PATCH /tickets/:id/priority` is guarded by `@Roles(...)` and
 * re-checked in `TicketsService.updatePriority()`. The caller decides whether
 * to render this at all; an Employee never sees it.
 */
export function PriorityControl({
  priority,
  submitting,
  onChange,
}: PriorityControlProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="ticket-priority-control"
        className="text-sm font-medium text-slate-900"
      >
        Priority
      </label>
      <Select
        id="ticket-priority-control"
        value={priority}
        disabled={submitting}
        onChange={(event) => onChange(event.target.value as TicketPriority)}
      >
        {TICKET_PRIORITIES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </div>
  );
}
