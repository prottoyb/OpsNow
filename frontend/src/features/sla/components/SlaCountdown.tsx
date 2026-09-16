import type { TicketSla } from '../../../types/api';
import {
  ageMinutes,
  formatFrozenRemaining,
  formatRemaining,
} from '../slaDisplay';
import type { SlaClockView } from '../slaDisplay';
import { useSlaTick } from '../slaTicker';
import { useSlaAnchor } from '../useSlaAnchor';

const FIGURE_CLASSES = 'text-xs font-medium text-slate-700';

/**
 * Only this component subscribes to the shared ticker, so a paused or
 * finished clock does not merely *appear* not to tick — it holds no
 * subscription and cannot be re-rendered by a tick at all.
 *
 * The ticking figure is `aria-hidden`: a number that silently rewrites itself
 * every 30 seconds is noise for a screen-reader user, and the meaning is
 * already carried by the state badge beside it and the absolute `<time>`
 * below it.
 */
function TickingCountdown({
  sla,
  minutesRemaining,
}: {
  sla: TicketSla;
  minutesRemaining: number;
}) {
  const anchorInstant = useSlaAnchor(sla);
  const now = useSlaTick();

  return (
    <span aria-hidden="true" className={FIGURE_CLASSES}>
      {formatRemaining(ageMinutes(minutesRemaining, anchorInstant, now))}
    </span>
  );
}

export function SlaCountdown({
  sla,
  view,
}: {
  sla: TicketSla;
  view: SlaClockView;
}) {
  if (view.mode === 'static') {
    return null;
  }

  if (view.mode === 'frozen') {
    // Not aria-hidden: a frozen figure never changes, so it is safe — and
    // useful — to expose.
    return (
      <span className={FIGURE_CLASSES}>
        {formatFrozenRemaining(view.minutesRemaining)}
      </span>
    );
  }

  return <TickingCountdown sla={sla} minutesRemaining={view.minutesRemaining} />;
}
