import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTicket, makeTicketSla } from '../../../mocks/fixtures';
import type { Ticket } from '../../../types/api';
import { SLA_TICK_INTERVAL_MS } from '../slaTicker';
import { TicketSlaIndicator } from './TicketSlaIndicator';
import { TicketSlaPanel } from './TicketSlaPanel';

/**
 * These tests drive the shared ticker directly with fake timers. They render
 * plain components — no router, no query client, no MSW — so nothing here
 * can make a network request, which is itself part of the contract: a
 * countdown reaching zero must never trigger a refetch.
 */

let setIntervalSpy: ReturnType<typeof vi.spyOn>;

/** Counts only intervals created at the SLA tick rate, so an unrelated
 * interval from a library could never make this pass by accident. */
function slaIntervalCount(): number {
  const calls = setIntervalSpy.mock.calls as unknown as unknown[][];
  return calls.filter((call) => call[1] === SLA_TICK_INTERVAL_MS).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
});

afterEach(() => {
  // Unmount first, so the ticker's last subscriber leaves and the interval is
  // cleared while the fake timers are still installed.
  cleanup();
  setIntervalSpy.mockRestore();
  vi.useRealTimers();
});

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function runningTicket(minutes: number, overrides: Partial<Ticket> = {}): Ticket {
  return makeTicket({
    sla: makeTicketSla({
      responseState: 'Running',
      responseMinutesRemaining: minutes,
      resolutionState: 'Running',
      resolutionMinutesRemaining: minutes * 4,
    }),
    ...overrides,
  });
}

describe('shared SLA ticker', () => {
  it('counts a live clock down as real time passes', () => {
    render(<TicketSlaPanel ticket={runningTicket(120)} />);

    expect(screen.getByText('2h left')).toBeInTheDocument();

    advance(SLA_TICK_INTERVAL_MS * 2); // one minute
    expect(screen.getByText('1h 59m left')).toBeInTheDocument();

    advance(SLA_TICK_INTERVAL_MS * 20); // ten more minutes
    expect(screen.getByText('1h 49m left')).toBeInTheDocument();
  });

  it('clamps at "Due now" instead of going negative or claiming a breach', () => {
    render(<TicketSlaPanel ticket={runningTicket(2)} />);

    advance(SLA_TICK_INTERVAL_MS * 20); // ten minutes — well past the two left

    expect(screen.getAllByText('Due now').length).toBeGreaterThan(0);
    expect(screen.queryByText(/-\d/)).not.toBeInTheDocument();
    // The badge still says what the backend said, untouched by local time.
    expect(screen.getByText('Response on track')).toBeInTheDocument();
    expect(screen.queryByText(/breached|overdue/i)).not.toBeInTheDocument();
  });

  it('uses ONE interval no matter how many countdowns are on the page', () => {
    const tickets = Array.from({ length: 20 }, (_, index) =>
      runningTicket(120, {
        id: `a${String(index).padStart(7, '0')}-1111-4111-8111-111111111111`,
      }),
    );

    render(
      <>
        {tickets.map((ticket) => (
          <TicketSlaIndicator key={ticket.id} ticket={ticket} />
        ))}
      </>,
    );

    expect(screen.getAllByText('2h left')).toHaveLength(20);
    expect(slaIntervalCount()).toBe(1);

    advance(SLA_TICK_INTERVAL_MS * 2);

    expect(screen.getAllByText('1h 59m left')).toHaveLength(20);
    expect(slaIntervalCount()).toBe(1);
  });

  it('starts no interval at all when nothing on the page ticks', () => {
    render(
      <TicketSlaPanel
        ticket={makeTicket({
          status: 'Resolved',
          resolvedAt: new Date().toISOString(),
          sla: makeTicketSla({
            responseState: 'Met',
            responseAt: new Date().toISOString(),
            resolutionState: 'Met',
          }),
        })}
      />,
    );

    expect(slaIntervalCount()).toBe(0);
  });

  it('stops the interval once the last countdown unmounts', () => {
    const { unmount } = render(
      <TicketSlaIndicator ticket={runningTicket(120)} />,
    );
    expect(slaIntervalCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('clocks that must not tick', () => {
  it('holds a paused clock frozen however much time passes', () => {
    render(
      <TicketSlaPanel
        ticket={makeTicket({
          status: 'OnHold',
          sla: makeTicketSla({
            responseState: 'Paused',
            responseMinutesRemaining: 30,
            resolutionState: 'Paused',
            resolutionMinutesRemaining: 240,
            isPaused: true,
          }),
        })}
      />,
    );

    expect(screen.getByText('30m left before pause')).toBeInTheDocument();

    advance(SLA_TICK_INTERVAL_MS * 40); // twenty minutes

    expect(screen.getByText('30m left before pause')).toBeInTheDocument();
    expect(screen.getByText('4h left before pause')).toBeInTheDocument();
    // A paused clock never even subscribes, so no interval exists to tick it.
    expect(slaIntervalCount()).toBe(0);
  });

  it('shows no figure at all for a terminal clock, whatever the wall clock does', () => {
    const resolvedAt = new Date().toISOString();

    render(
      <TicketSlaPanel
        ticket={makeTicket({
          status: 'Resolved',
          resolvedAt,
          sla: makeTicketSla({
            responseState: 'Met',
            responseAt: resolvedAt,
            resolutionState: 'Breached',
            // The backend keeps decaying this against wall-clock time on a
            // finished clock; it is meaningless there and must never show.
            resolutionMinutesRemaining: 0,
          }),
        })}
      />,
    );

    expect(screen.queryAllByText(/left$/)).toHaveLength(0);

    advance(SLA_TICK_INTERVAL_MS * 100);

    expect(screen.queryAllByText(/left$/)).toHaveLength(0);
    expect(screen.queryByText('Due now')).not.toBeInTheDocument();
    expect(screen.getByText('Response met')).toBeInTheDocument();
    expect(screen.getByText('Resolution breached')).toBeInTheDocument();
  });
});

describe('ticker and tab visibility', () => {
  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  afterEach(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  it('stops ticking while the tab is hidden and catches up on return', () => {
    render(<TicketSlaPanel ticket={runningTicket(120)} />);
    expect(screen.getByText('2h left')).toBeInTheDocument();

    setHidden(true);
    expect(vi.getTimerCount()).toBe(0);

    // Ten minutes pass with the tab in the background.
    act(() => {
      vi.advanceTimersByTime(SLA_TICK_INTERVAL_MS * 20);
    });
    expect(screen.getByText('2h left')).toBeInTheDocument();

    // Coming back re-reads the clock immediately rather than waiting a tick.
    setHidden(false);
    expect(screen.getByText('1h 50m left')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
  });
});
