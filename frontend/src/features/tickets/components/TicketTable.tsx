import { Link } from 'react-router-dom';
import { CARD_SURFACE_CLASSES } from '../../../components/ui/Card';
import { formatDateTime, fullName, toDateTimeAttribute } from '../../../lib/format';
import type { Ticket } from '../../../types/api';
import { TicketSlaIndicator } from '../../sla/components/TicketSlaIndicator';
import { TicketPriorityBadge, TicketStatusBadge } from './TicketStatusBadge';

const LINK_CLASSES =
  'font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

function assigneeLabel(ticket: Ticket): string {
  return ticket.assignee ? fullName(ticket.assignee) : 'Unassigned';
}

/**
 * Two representations of the same rows, switched by CSS. Tailwind's `hidden`
 * is `display:none`, which removes the inactive one from the accessibility
 * tree as well as the layout, so assistive tech never sees both.
 */
export function TicketTable({ tickets }: { tickets: readonly Ticket[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Tickets</caption>
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
              <th scope="col" className="px-3 py-2.5">
                Ticket
              </th>
              <th scope="col" className="px-3 py-2.5">
                Subject
              </th>
              <th scope="col" className="px-3 py-2.5">
                Status
              </th>
              <th scope="col" className="px-3 py-2.5">
                Priority
              </th>
              <th scope="col" className="px-3 py-2.5">
                SLA
              </th>
              <th scope="col" className="px-3 py-2.5">
                Assignee
              </th>
              <th scope="col" className="px-3 py-2.5">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="align-top transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
              >
                <td className="px-3 py-3 text-slate-600">
                  #{ticket.ticketNumber}
                </td>
                <td className="px-3 py-3">
                  <Link to={`/tickets/${ticket.id}`} className={LINK_CLASSES}>
                    {ticket.subject}
                  </Link>
                  {ticket.category ? (
                    <p className="text-xs text-slate-500">
                      {ticket.category.name}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <TicketStatusBadge status={ticket.status} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <TicketPriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <TicketSlaIndicator ticket={ticket} />
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {assigneeLabel(ticket)}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <time dateTime={toDateTimeAttribute(ticket.createdAt)}>
                    {formatDateTime(ticket.createdAt)}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {tickets.map((ticket) => (
          <li key={ticket.id} className={CARD_SURFACE_CLASSES}>
            <p className="text-xs text-slate-500">#{ticket.ticketNumber}</p>
            <Link to={`/tickets/${ticket.id}`} className={LINK_CLASSES}>
              {ticket.subject}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
              <TicketSlaIndicator ticket={ticket} />
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-slate-600">
              <dt className="font-medium">Assignee</dt>
              <dd>{assigneeLabel(ticket)}</dd>
              <dt className="font-medium">Created</dt>
              <dd>
                <time dateTime={toDateTimeAttribute(ticket.createdAt)}>
                  {formatDateTime(ticket.createdAt)}
                </time>
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
