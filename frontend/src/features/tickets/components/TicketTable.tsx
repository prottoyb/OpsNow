import { Link } from 'react-router-dom';
import { formatDateTime, fullName, toDateTimeAttribute } from '../../../lib/format';
import type { Ticket } from '../../../types/api';
import { TicketSlaIndicator } from '../../sla/components/TicketSlaIndicator';
import { TicketPriorityBadge, TicketStatusBadge } from './TicketStatusBadge';

const LINK_CLASSES =
  'font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

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
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Tickets</caption>
          <thead>
            <tr className="border-b border-slate-300 text-slate-700">
              <th scope="col" className="px-3 py-2 font-semibold">
                Ticket
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Subject
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Status
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Priority
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                SLA
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Assignee
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="border-b border-slate-200 align-top"
              >
                <td className="px-3 py-2 text-slate-600">
                  #{ticket.ticketNumber}
                </td>
                <td className="px-3 py-2">
                  <Link to={`/tickets/${ticket.id}`} className={LINK_CLASSES}>
                    {ticket.subject}
                  </Link>
                  {ticket.category ? (
                    <p className="text-xs text-slate-500">
                      {ticket.category.name}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <TicketStatusBadge status={ticket.status} />
                </td>
                <td className="px-3 py-2">
                  <TicketPriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-3 py-2">
                  <TicketSlaIndicator ticket={ticket} />
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {assigneeLabel(ticket)}
                </td>
                <td className="px-3 py-2 text-slate-600">
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
          <li
            key={ticket.id}
            className="rounded-md border border-slate-200 bg-white p-4"
          >
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
