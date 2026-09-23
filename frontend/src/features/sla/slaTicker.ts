import { useSyncExternalStore } from 'react';

/**
 * One timer for the whole page.
 *
 * Twenty ticket rows each showing a live countdown must not mean twenty
 * intervals, so the interval lives here at module scope: it starts when the
 * first countdown subscribes and is cleared when the last one unsubscribes.
 * Every subscriber reads the same `currentTick` instant, so all countdowns
 * on a page move together.
 *
 * The ticker NEVER performs a network request, and nothing here reacts to a
 * countdown reaching zero — staleness is entirely TanStack Query's business,
 * exactly as it is for every other field on a ticket. See DECISIONS.md
 * ADR-021.
 *
 * Be precise about what that lifecycle actually is here:
 * `lib/api/queryClient.ts` sets `refetchOnWindowFocus: false` project-wide,
 * so refreshing is bounded by `staleTime` plus refetch-on-mount only. A tab
 * left open in the background is therefore NOT refreshed on return, and its
 * countdown can sit at "Due now" beside a badge that still reads "on track"
 * until something remounts the query. The badge remains the backend's last
 * word, so this is stale rather than wrong — but it is a real consequence,
 * recorded in ADR-021 as a deferred decision, not
 * something this ticker should paper over with a focus-driven refetch.
 */

/** Slow enough to be cheap, fast enough that a minute figure is never
 * visibly wrong by more than about half a minute. */
export const SLA_TICK_INTERVAL_MS = 30_000;

type Listener = () => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentTick = Date.now();

function publishNow(): void {
  currentTick = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function startInterval(): void {
  if (intervalId !== null) {
    return;
  }
  // A function reference, never a string — a string argument would be
  // evaluated as code.
  intervalId = setInterval(publishNow, SLA_TICK_INTERVAL_MS);
}

function stopInterval(): void {
  if (intervalId === null) {
    return;
  }
  clearInterval(intervalId);
  intervalId = null;
}

/**
 * A backgrounded tab does not need its countdowns advanced, and browsers
 * throttle its timers anyway. On return the tick is published immediately so
 * the first painted frame is already correct rather than up to 30s stale.
 */
function handleVisibilityChange(): void {
  if (document.hidden) {
    stopInterval();
    return;
  }
  publishNow();
  startInterval();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  if (listeners.size === 1) {
    // The module may have been imported long before the first countdown
    // mounted, so the stored tick is re-anchored here. React re-reads the
    // snapshot immediately after subscribing, so this is picked up.
    currentTick = Date.now();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) {
      startInterval();
    }
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopInterval();
    }
  };
}

function getSnapshot(): number {
  return currentTick;
}

/**
 * The shared "now" every SLA countdown ages against, in epoch milliseconds.
 * Changes at most once per tick, so a component using it re-renders at most
 * once per tick.
 */
export function useSlaTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
