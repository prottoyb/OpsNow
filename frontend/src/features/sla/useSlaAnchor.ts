import { useRef } from 'react';
import type { TicketSla } from '../../types/api';

/**
 * The countdown's zero point: the instant a countdown first RENDERED with
 * this SLA payload.
 *
 * That is deliberately not the same as the instant the payload arrived. A
 * component mounting against a cache entry that is already populated but
 * still fresh anchors at mount, which can be up to the query's `staleTime`
 * (10s, `lib/api/queryClient.ts`) after the data actually landed — so the
 * figure can read that much more generous than the server's own view. This
 * is bounded, small against a figure displayed to the nearest minute, and
 * accepted; ADR-021 records it alongside the other accuracy bounds.
 *
 * Identity, not value, is the trigger. TanStack Query's structural sharing
 * hands back the very same object when a refetch produces identical data, so
 * the anchor holds still across re-renders and refetches and only moves when
 * the numbers actually change. Keying on identity is also what makes the
 * write below idempotent under StrictMode's double render: the second render
 * sees `anchor.current.sla === sla` and leaves the instant alone, so the
 * anchor cannot be quietly reset by a re-render that changed nothing.
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
