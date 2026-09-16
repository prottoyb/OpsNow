import { Badge } from '../../../components/ui/Badge';
import type { Ticket } from '../../../types/api';
import { summariseSla } from '../slaDisplay';
import { SlaCountdown } from './SlaCountdown';

/**
 * One SLA badge per ticket-list row: the more severe of the ticket's two
 * clocks, always naming which clock it refers to. "Response breached" and
 * "Resolution at risk" call for different work, so they are never collapsed
 * into a generic "SLA breached".
 */
export function TicketSlaIndicator({ ticket }: { ticket: Ticket }) {
  const { sla } = ticket;

  if (sla === null) {
    return <span className="text-xs text-slate-500">No SLA</span>;
  }

  const view = summariseSla(sla, ticket.resolvedAt);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={view.tone} srPrefix="SLA:">
        {view.label}
      </Badge>
      <SlaCountdown sla={sla} view={view} />
    </span>
  );
}
