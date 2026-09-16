import { HttpResponse, delay, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  agentUser,
  employeeUser,
  makeTicket,
  makeTicketSla,
} from '../../mocks/fixtures';
import { resetMockState } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/renderApp';

const BASE = '*/api/v1';

function table() {
  return within(screen.getByRole('table'));
}

async function waitForList() {
  await screen.findByRole('heading', { name: 'Tickets' });
  await waitFor(() =>
    expect(screen.queryByText(/loading tickets/i)).not.toBeInTheDocument(),
  );
}

describe('SLA in the ticket list', () => {
  it('gives every row one badge naming the more severe clock', async () => {
    resetMockState({
      currentUser: agentUser,
      tickets: [
        makeTicket({
          id: 'a0000001-1111-4111-8111-111111111111',
          subject: 'Breached one',
          sla: makeTicketSla({
            responseState: 'Met',
            responseAt: new Date().toISOString(),
            resolutionState: 'Breached',
          }),
        }),
        makeTicket({
          id: 'a0000002-1111-4111-8111-111111111111',
          subject: 'At risk one',
          sla: makeTicketSla({
            responseState: 'AtRisk',
            responseMinutesRemaining: 9,
          }),
        }),
      ],
    });

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(
      table().getByRole('columnheader', { name: 'SLA' }),
    ).toBeInTheDocument();
    // Spelled out, and naming WHICH clock — never colour alone, never a
    // generic "SLA breached".
    expect(table().getByText('Resolution breached')).toBeInTheDocument();
    expect(table().getByText('Response at risk')).toBeInTheDocument();
    expect(table().getByText('9m left')).toBeInTheDocument();
  });

  it('says "No SLA" in plain text for a ticket with no SLA', async () => {
    resetMockState({
      currentUser: agentUser,
      tickets: [makeTicket({ subject: 'Unpoliced', sla: null })],
    });

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(table().getByText('No SLA')).toBeInTheDocument();
    expect(table().queryByText(/left$/)).not.toBeInTheDocument();
  });

  it('shows a paused row as frozen, with no countdown', async () => {
    resetMockState({
      currentUser: agentUser,
      tickets: [
        makeTicket({
          subject: 'Held',
          status: 'OnHold',
          sla: makeTicketSla({
            responseState: 'Paused',
            responseMinutesRemaining: 45,
            resolutionState: 'Paused',
            resolutionMinutesRemaining: 200,
            isPaused: true,
          }),
        }),
      ],
    });

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(table().getByText('Response paused')).toBeInTheDocument();
    expect(table().getByText('45m left before pause')).toBeInTheDocument();
  });
});

/**
 * Regression test for a real defect found in design review.
 *
 * `useTicketList` renders with `placeholderData: keepPreviousData`, so while
 * a filter or page change is in flight the previous page's rows stay on
 * screen — and during that render TanStack Query reports the NEW query's
 * `dataUpdatedAt`, which is `0`: the epoch. A countdown anchored on
 * `dataUpdatedAt` would therefore age every row by decades the instant a
 * user paginates or filters, and the whole list would read "Due now".
 *
 * The countdown is anchored on a locally captured receipt instant tied to
 * the payload's object identity instead, so the rows keep counting down
 * correctly through the transition.
 */
describe('SLA countdowns survive placeholder data (regression)', () => {
  const manyTickets = Array.from({ length: 25 }, (_, index) =>
    makeTicket({
      id: `a${String(index).padStart(7, '0')}-1111-4111-8111-111111111111`,
      ticketNumber: 1000 + index,
      subject: `Ticket ${index}`,
      sla: makeTicketSla({
        responseState: 'Running',
        responseMinutesRemaining: 120,
      }),
    }),
  );

  it('does not corrupt any row countdown while the next page loads', async () => {
    resetMockState({ currentUser: agentUser, tickets: manyTickets });
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    await waitForList();
    expect(screen.getAllByText('2h left').length).toBeGreaterThan(0);

    // Hold the next page in flight so the placeholder render is observable
    // rather than a frame that flickers past.
    server.use(
      http.get(`${BASE}/tickets`, async () => {
        await delay(400);
        return HttpResponse.json({ data: [], total: 25 });
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Still showing the previous page (placeholder data) — and still counting
    // down from the right instant, not from 1970.
    expect(table().getByRole('link', { name: 'Ticket 0' })).toBeInTheDocument();
    expect(screen.getAllByText('2h left').length).toBeGreaterThan(0);
    expect(screen.queryByText('Due now')).not.toBeInTheDocument();
    expect(screen.queryByText(/breached|overdue/i)).not.toBeInTheDocument();
  });

  it('does not corrupt any row countdown while a filter change loads', async () => {
    resetMockState({ currentUser: agentUser, tickets: manyTickets });
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    await waitForList();

    server.use(
      http.get(`${BASE}/tickets`, async () => {
        await delay(400);
        return HttpResponse.json({ data: [], total: 0 });
      }),
    );

    await user.selectOptions(screen.getByLabelText('Priority'), 'Critical');

    expect(screen.getAllByText('2h left').length).toBeGreaterThan(0);
    expect(screen.queryByText('Due now')).not.toBeInTheDocument();
  });
});

describe('SLA visibility by role in the list', () => {
  it('shows an Employee the same SLA state on their own ticket', async () => {
    resetMockState({
      currentUser: employeeUser,
      tickets: [
        makeTicket({
          subject: 'Mine',
          sla: makeTicketSla({
            responseState: 'AtRisk',
            responseMinutesRemaining: 9,
          }),
        }),
      ],
    });

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(table().getByText('Response at risk')).toBeInTheDocument();
    expect(table().getByText('9m left')).toBeInTheDocument();
  });
});
