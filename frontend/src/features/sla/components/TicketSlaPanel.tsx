import { Badge } from '../../../components/ui/Badge';
import {
  formatDateTime,
  formatDurationMinutes,
  toDateTimeAttribute,
} from '../../../lib/format';
import type { Ticket, TicketSla } from '../../../types/api';
import { describeResolutionClock, describeResponseClock } from '../slaDisplay';
import type { SlaClockView } from '../slaDisplay';
import { SlaCountdown } from './SlaCountdown';

function SlaClock({
  sla,
  view,
  targetMinutes,
}: {
  sla: TicketSla;
  view: SlaClockView;
  targetMinutes: number;
}) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={view.tone} srPrefix="SLA:">
          {view.label}
        </Badge>
        <SlaCountdown sla={sla} view={view} />
      </div>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium text-slate-700">{view.dueLabel}</dt>
        <dd className="text-slate-800">
          <time dateTime={toDateTimeAttribute(view.dueAt)}>
            {formatDateTime(view.dueAt)}
          </time>
        </dd>
        {view.completedAt !== null && view.completedLabel !== null ? (
          <>
            <dt className="font-medium text-slate-700">{view.completedLabel}</dt>
            <dd className="text-slate-800">
              <time dateTime={toDateTimeAttribute(view.completedAt)}>
                {formatDateTime(view.completedAt)}
              </time>
            </dd>
          </>
        ) : null}
        <dt className="font-medium text-slate-700">Target</dt>
        <dd className="text-slate-800">
          {formatDurationMinutes(targetMinutes)}
        </dd>
      </dl>

      {view.note ? (
        <p className="mt-2 text-xs text-slate-600">{view.note}</p>
      ) : null}
    </div>
  );
}

/**
 * The ticket detail page's SLA panel: one block per clock, plus the
 * display-only total time on hold when there has been any.
 *
 * A ticket with no SLA is a normal outcome, not an error — no policy was
 * active for its priority when it was created (ADR-020) — so it gets plain
 * explanatory text rather than a badge implying some state.
 */
export function TicketSlaPanel({ ticket }: { ticket: Ticket }) {
  const { sla } = ticket;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">SLA</h2>

      {sla === null ? (
        <p className="mt-3 text-sm text-slate-600">
          No SLA applies to this ticket.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <SlaClock
            sla={sla}
            view={describeResponseClock(sla)}
            targetMinutes={sla.responseTargetMinutes}
          />
          <SlaClock
            sla={sla}
            view={describeResolutionClock(sla, ticket.resolvedAt)}
            targetMinutes={sla.resolutionTargetMinutes}
          />
          {sla.totalPausedMinutes > 0 ? (
            <p className="text-xs text-slate-500">
              Total time on hold:{' '}
              {formatDurationMinutes(sla.totalPausedMinutes)}.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
