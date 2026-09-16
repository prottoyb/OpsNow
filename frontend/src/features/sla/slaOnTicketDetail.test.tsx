import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  employeeUser,
  makeTicket,
  makeTicketSla,
} from '../../mocks/fixtures';
import { resetMockState } from '../../mocks/handlers';
import { renderApp } from '../../test/renderApp';
import type { Ticket } from '../../types/api';

const HOUR = 60 * 60 * 1000;
const PAST = new Date(Date.now() - 4 * HOUR).toISOString();

async function renderDetail(ticket: Ticket, currentUser = employeeUser) {
  resetMockState({ currentUser, tickets: [ticket] });
  renderApp({ route: `/tickets/${ticket.id}` });
  return screen.findByRole('heading', { level: 2, name: 'SLA' });
}

function slaPanel(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: 'SLA' });
  const panel = heading.closest('section');
  if (!panel) {
    throw new Error('SLA panel not found');
  }
  return panel;
}

describe('SLA on the ticket detail page', () => {
  it('shows both clocks with due dates and a live response countdown', async () => {
    await renderDetail(
      makeTicket({
        sla: makeTicketSla({
          responseState: 'Running',
          responseMinutesRemaining: 45,
          resolutionState: 'Running',
          resolutionMinutesRemaining: 300,
        }),
      }),
    );

    const panel = within(slaPanel());
    expect(panel.getByText('Response on track')).toBeInTheDocument();
    expect(panel.getByText('Resolution on track')).toBeInTheDocument();
    expect(panel.getByText('45m left')).toBeInTheDocument();
    expect(panel.getByText('5h left')).toBeInTheDocument();
    expect(panel.getAllByText('Due')).toHaveLength(2);
    // Both targets are shown, in human units.
    expect(panel.getByText('1h')).toBeInTheDocument();
    expect(panel.getByText('8h')).toBeInTheDocument();
  });

  it('renders "No SLA applies to this ticket." when the ticket has no SLA', async () => {
    await renderDetail(makeTicket({ sla: null }));

    const panel = within(slaPanel());
    expect(
      panel.getByText('No SLA applies to this ticket.'),
    ).toBeInTheDocument();
    expect(panel.queryByText(/left$/)).not.toBeInTheDocument();
  });

  /**
   * A ticket that is Resolved but pending a possible reopen carries a
   * non-null pause anchor internally (ADR-020's D4 mechanism reuses the same
   * column). That must NOT present as "paused" — `isPaused` is false, because
   * the ticket's status is Resolved, not OnHold.
   */
  it('does not present a resolved-pending-reopen ticket as paused', async () => {
    await renderDetail(
      makeTicket({
        status: 'Resolved',
        resolvedAt: PAST,
        sla: makeTicketSla({
          responseState: 'Met',
          responseAt: PAST,
          resolutionState: 'Met',
          isPaused: false,
          totalPausedMinutes: 0,
        }),
      }),
    );

    const panel = within(slaPanel());
    expect(panel.getByText('Response met')).toBeInTheDocument();
    expect(panel.getByText('Resolution met')).toBeInTheDocument();
    expect(panel.queryByText(/paused/i)).not.toBeInTheDocument();
    expect(panel.queryByText(/left/)).not.toBeInTheDocument();
  });

  it('shows a reopened ticket back on a live, shifted resolution clock', async () => {
    await renderDetail(
      makeTicket({
        status: 'Open',
        resolvedAt: null,
        reopenedCount: 1,
        sla: makeTicketSla({
          responseState: 'Met',
          responseAt: PAST,
          resolutionState: 'AtRisk',
          resolutionMinutesRemaining: 60,
          isPaused: false,
          totalPausedMinutes: 180,
        }),
      }),
    );

    const panel = within(slaPanel());
    expect(panel.getByText('Response met')).toBeInTheDocument();
    expect(panel.getByText('Resolution at risk')).toBeInTheDocument();
    expect(panel.getByText('1h left')).toBeInTheDocument();
    expect(panel.getByText(/Total time on hold: 3h/)).toBeInTheDocument();
  });

  it('shows staff exactly the same SLA panel an Employee sees', async () => {
    const sla = makeTicketSla({
      responseState: 'AtRisk',
      responseMinutesRemaining: 9,
      resolutionState: 'Running',
      resolutionMinutesRemaining: 240,
    });

    await renderDetail(makeTicket({ id: IDS.ticketA, sla }), employeeUser);
    const employeeText = slaPanel().textContent;

    // Fresh render as staff, same ticket, same payload.
    await renderDetail(makeTicket({ id: IDS.ticketA, sla }), agentUser);
    const staffText = slaPanel().textContent;

    expect(staffText).toEqual(employeeText);
    expect(staffText).toContain('Response at risk');
  });
});
