import { useRef } from 'react';
import type { TicketSla } from '../../types/api';

/**
 * The instant this browser first saw THIS SLA payload, used as the countdown's
 * zero point.
 *
 * Identity, not value, is the trigger. TanStack Query's structural sharing
 * hands back the very same object when a refetch produces identical data, so
 * the anchor holds still across re-renders and refetches and only moves when
 * the numbers actually change.
 *
 * Why not `query.dataUpdatedAt`? Because `useTicketList` renders placeholder
 * data (`keepPreviousData`) while a filter or page change is in flight, and
 * during that render `dataUpdatedAt` is the NEW query's `0` — the epoch. Every
 * countdown on the page would instantly age by decades and read "Due now".
 *
 * Why not the server's own clock? Because that would need the server instant
 * and the browser instant to be comparable, which is exactly the clock-skew
 * assumption the rest of this feature avoids. The cost of anchoring locally
 * is network latency (tens of milliseconds) against a figure displayed to the
 * nearest minute.
 */
export function useSlaAnchor(sla: TicketSla): number {
  const anchor = useRef<{ sla: TicketSla; at: number } | null>(null);

  if (anchor.current === null || anchor.current.sla !== sla) {
    anchor.current = { sla, at: Date.now() };
  }

  return anchor.current.at;
}
