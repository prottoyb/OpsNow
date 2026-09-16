import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeTicket, makeTicketSla } from '../../../mocks/fixtures';
import type { Ticket, TicketSla } from '../../../types/api';
import { TicketSlaPanel } from './TicketSlaPanel';

const HOUR = 60 * 60 * 1000;
const PAST = new Date(Date.now() - 5 * HOUR).toISOString();
const FUTURE = new Date(Date.now() + 5 * HOUR).toISOString();

function renderPanel(
  sla: Partial<TicketSla> | null,
  ticket: Partial<Ticket> = {},
) {
  return render(
    <TicketSlaPanel
      ticket={makeTicket({
        sla: sla === null ? null : makeTicketSla(sla),
        ...ticket,
      })}
    />,
  );
}

/** Everything a live countdown ever renders ends in "left". */
function countdowns(): HTMLElement[] {
  return screen.queryAllByText(/left$/);
}

describe('ticket SLA panel — response clock states', () => {
  it('renders an on-track response with a live countdown', () => {
    renderPanel({ responseState: 'Running', responseMinutesRemaining: 134 });

    expect(screen.getByText('Response on track')).toBeInTheDocument();
    expect(screen.getByText('2h 14m left')).toBeInTheDocument();
  });

  it('renders an at-risk response with a live countdown', () => {
    renderPanel({
      responseState: 'AtRisk',
      responseMinutesRemaining: 8,
      resolutionState: 'Running',
      resolutionMinutesRemaining: 300,
    });

    expect(screen.getByText('Response at risk')).toBeInTheDocument();
    expect(screen.getByText('8m left')).toBeInTheDocument();
  });

  it('renders an in-flight breach as overdue-since, with no countdown', () => {
    renderPanel({
      responseState: 'Breached',
      responseAt: null,
      responseMinutesRemaining: 0,
      responseDueAt: PAST,
      resolutionState: 'Breached',
      resolutionDueAt: PAST,
    });

    expect(screen.getAllByText(/breached/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Overdue since').length).toBe(2);
    expect(countdowns()).toHaveLength(0);
  });

  it('renders a late-but-recorded response with its completion instant', () => {
    renderPanel({ responseState: 'Breached', responseAt: PAST });

    expect(screen.getByText('Response breached')).toBeInTheDocument();
    expect(screen.getByText('First response')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The first response was recorded after the response target.',
      ),
    ).toBeInTheDocument();
  });

  it('renders a met response as terminal, with timestamps and no countdown', () => {
    renderPanel({
      responseState: 'Met',
      responseAt: PAST,
      resolutionState: 'Met',
      resolutionMinutesRemaining: 0,
    }, { resolvedAt: PAST, status: 'Resolved' });

    expect(screen.getByText('Response met')).toBeInTheDocument();
    expect(screen.getByText('Resolution met')).toBeInTheDocument();
    expect(screen.getByText('First response')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(countdowns()).toHaveLength(0);
  });

  it('renders "no response recorded" for a ticket resolved without a reply', () => {
    renderPanel({
      responseState: 'NoResponse',
      responseAt: null,
      resolutionState: 'Met',
    }, { resolvedAt: PAST, status: 'Resolved' });

    expect(screen.getByText('No response recorded')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This ticket was resolved without a qualifying first response.',
      ),
    ).toBeInTheDocument();
    expect(countdowns()).toHaveLength(0);
  });
});

describe('ticket SLA panel — paused clocks', () => {
  it('shows a frozen figure labelled "before pause"', () => {
    renderPanel({
      responseState: 'Paused',
      responseMinutesRemaining: 30,
      resolutionState: 'Paused',
      resolutionMinutesRemaining: 240,
      isPaused: true,
      totalPausedMinutes: 90,
    }, { status: 'OnHold' });

    expect(screen.getByText('Response paused')).toBeInTheDocument();
    expect(screen.getByText('30m left before pause')).toBeInTheDocument();
    expect(screen.getByText('Resolution paused')).toBeInTheDocument();
    expect(screen.getByText('4h left before pause')).toBeInTheDocument();
    expect(screen.getAllByText('Due before pause')).toHaveLength(2);
    expect(screen.getByText(/Total time on hold: 1h 30m/)).toBeInTheDocument();
  });

  it('gives a paused-but-already-past-due clock distinct copy and no figure', () => {
    renderPanel({
      responseState: 'Paused',
      responseMinutesRemaining: 0,
      resolutionState: 'Paused',
      resolutionMinutesRemaining: 60,
      isPaused: true,
    }, { status: 'OnHold' });

    expect(
      screen.getByText('Response paused — already past due'),
    ).toBeInTheDocument();
    // The misleading alternative must not appear.
    expect(screen.queryByText(/0m left/)).not.toBeInTheDocument();
    // The other clock still has time and still shows its frozen figure.
    expect(screen.getByText('1h left before pause')).toBeInTheDocument();
  });
});

/**
 * The backend's state string is the whole truth. A due date that disagrees
 * with it (a skewed client clock, a slow render, a stale tab) must never
 * change what the badge says.
 */
describe('ticket SLA panel — backend authority', () => {
  it('shows "breached" even though the due date is in the future', () => {
    renderPanel({
      responseState: 'Breached',
      responseAt: null,
      responseDueAt: FUTURE,
      resolutionState: 'Running',
      resolutionMinutesRemaining: 300,
    });

    expect(screen.getByText('Response breached')).toBeInTheDocument();
    expect(screen.queryByText('Response on track')).not.toBeInTheDocument();
  });

  it('does not show "breached" for a running clock whose due date has passed', () => {
    renderPanel({
      responseState: 'Running',
      responseMinutesRemaining: 45,
      responseDueAt: PAST,
      resolutionState: 'AtRisk',
      resolutionMinutesRemaining: 30,
      resolutionDueAt: PAST,
    });

    expect(screen.getByText('Response on track')).toBeInTheDocument();
    expect(screen.getByText('Resolution at risk')).toBeInTheDocument();
    expect(screen.queryByText(/breached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
  });
});

describe('ticket SLA panel — reopened ticket', () => {
  /**
   * The one terminal-to-live transition in the system: a Resolved ticket is
   * reopened, the resolved-to-reopened interval is credited as a pause, and
   * both clocks come back as live, shifted clocks. The response clock stays
   * finished — a first response already happened and is never un-happened.
   */
  it('renders live clocks again after a reopen, with shifted due dates', () => {
    renderPanel({
      responseState: 'Met',
      responseAt: PAST,
      resolutionState: 'Running',
      resolutionMinutesRemaining: 180,
      resolutionDueAt: FUTURE,
      isPaused: false,
      totalPausedMinutes: 120,
    }, { status: 'Open', resolvedAt: null, reopenedCount: 1 });

    expect(screen.getByText('Response met')).toBeInTheDocument();
    expect(screen.getByText('Resolution on track')).toBeInTheDocument();
    // The resolution clock is live again and ticking.
    expect(screen.getByText('3h left')).toBeInTheDocument();
    // The credited reopen interval shows up as on-hold time.
    expect(screen.getByText(/Total time on hold: 2h/)).toBeInTheDocument();
  });
});

describe('ticket SLA panel — unrecognised state', () => {
  it('degrades one clock neutrally and still renders the other', () => {
    renderPanel({
      responseState: 'SomethingNew' as TicketSla['responseState'],
      resolutionState: 'AtRisk',
      resolutionMinutesRemaining: 30,
    });

    expect(screen.getByText('Response state unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(/does not recognise/i),
    ).toBeInTheDocument();
    // The clock that WAS understood is unaffected and still counts down.
    expect(screen.getByText('Resolution at risk')).toBeInTheDocument();
    expect(screen.getByText('30m left')).toBeInTheDocument();
    // Nothing invented about the unknown clock.
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
    expect(screen.getByText('Due date')).toBeInTheDocument();
  });
});

describe('ticket SLA panel — no SLA', () => {
  it('says so in plain text, with no badge and no countdown', () => {
    const { container } = renderPanel(null);

    expect(
      screen.getByText('No SLA applies to this ticket.'),
    ).toBeInTheDocument();
    expect(countdowns()).toHaveLength(0);
    expect(container.querySelectorAll('time')).toHaveLength(0);
  });
});

describe('ticket SLA panel — accessibility', () => {
  it('uses semantic time elements and a definition list, never colour alone', () => {
    const { container } = renderPanel({
      responseState: 'Running',
      responseMinutesRemaining: 45,
    });

    const times = container.querySelectorAll('time');
    expect(times.length).toBeGreaterThan(0);
    for (const time of times) {
      expect(time.getAttribute('dateTime') ?? time.getAttribute('datetime'))
        .toBeTruthy();
    }
    expect(container.querySelectorAll('dl').length).toBe(2);
  });

  it('keeps the ticking figure out of the accessible name but keeps the badge in it', () => {
    renderPanel({ responseState: 'Running', responseMinutesRemaining: 134 });

    expect(screen.getByText('2h 14m left')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // The badge text itself is never hidden.
    expect(screen.getByText('Response on track')).not.toHaveAttribute(
      'aria-hidden',
    );
  });

  it('does not hide a frozen figure, which never changes', () => {
    renderPanel({
      responseState: 'Paused',
      responseMinutesRemaining: 30,
      isPaused: true,
    }, { status: 'OnHold' });

    expect(screen.getByText('30m left before pause')).not.toHaveAttribute(
      'aria-hidden',
    );
  });

  it('gives each clock badge a screen-reader prefix', () => {
    renderPanel({ responseState: 'Running', responseMinutesRemaining: 45 });

    const badge = screen.getByText('Response on track').closest('span');
    expect(badge).not.toBeNull();
    expect(within(badge as HTMLElement).getByText('SLA:')).toBeInTheDocument();
  });
});
