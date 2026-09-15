import { Badge } from '../../../components/ui/Badge';
import type { BadgeTone } from '../../../components/ui/Badge';
import type { TicketPriority, TicketStatus } from '../../../types/api';
import { statusLabel } from '../transitions';

/**
 * Tone is decoration only — the badge always renders the status/priority as
 * text, so nothing is conveyed by colour alone (WCAG 1.4.1).
 */
const STATUS_TONES: Record<TicketStatus, BadgeTone> = {
  New: 'info',
  Open: 'info',
  InProgress: 'warning',
  OnHold: 'neutral',
  Resolved: 'success',
  Closed: 'neutral',
};

const PRIORITY_TONES: Record<TicketPriority, BadgeTone> = {
  Low: 'neutral',
  Medium: 'info',
  High: 'warning',
  Critical: 'danger',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} srPrefix="Status:">
      {statusLabel(status)}
    </Badge>
  );
}

export function TicketPriorityBadge({
  priority,
}: {
  priority: TicketPriority;
}) {
  return (
    <Badge tone={PRIORITY_TONES[priority]} srPrefix="Priority:">
      {priority}
    </Badge>
  );
}
