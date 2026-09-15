import { Button } from '../../../components/ui/Button';
import type { Role, TicketStatus } from '../../../types/api';
import { availableTransitions, statusLabel } from '../transitions';

export interface StatusControlProps {
  status: TicketStatus;
  role: Role;
  submitting: boolean;
  onChange: (status: TicketStatus) => void;
}

/**
 * Offers only the transitions the backend's matrix permits for this role.
 * `Closed` has no outgoing transitions for anyone, Administrator included,
 * so this renders a plain statement rather than an empty button row.
 */
export function StatusControl({
  status,
  role,
  submitting,
  onChange,
}: StatusControlProps) {
  const options = availableTransitions(status, role);

  if (options.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        {status === 'Closed'
          ? 'This ticket is closed. A closed ticket cannot be reopened — raise a new ticket if the issue recurs.'
          : 'You cannot change the status of this ticket.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((next) => (
        <Button
          key={next}
          variant="secondary"
          disabled={submitting}
          onClick={() => onChange(next)}
        >
          {status === 'Resolved' && next === 'Open'
            ? 'Reopen ticket'
            : `Move to ${statusLabel(next)}`}
        </Button>
      ))}
    </div>
  );
}
