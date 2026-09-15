import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  employeeUser,
  makeTicket,
} from '../../../mocks/fixtures';
import { resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/renderApp';

const BASE = '*/api/v1';

/** The table and the mobile card list render the same rows; scope to one. */
function table() {
  return within(screen.getByRole('table'));
}

async function waitForList() {
  await screen.findByRole('heading', { name: 'Tickets' });
  await waitFor(() =>
    expect(screen.queryByText(/loading tickets/i)).not.toBeInTheDocument(),
  );
}

describe('ticket list — states', () => {
  it('shows a loading state before the first page arrives', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/tickets' });

    expect(await screen.findByText(/loading tickets/i)).toBeInTheDocument();
    await waitForList();
  });

  it('renders tickets in a table with column headers', async () => {
    resetMockState({
      currentUser: employeeUser,
      tickets: [makeTicket({ subject: 'Laptop will not boot' })],
    });

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(
      table().getByRole('columnheader', { name: 'Subject' }),
    ).toBeInTheDocument();
    expect(
      table().getByRole('link', { name: 'Laptop will not boot' }),
    ).toBeInTheDocument();
    // Status and priority are always spelled out, never colour alone.
    expect(table().getByText('New')).toBeInTheDocument();
    expect(table().getByText('Medium')).toBeInTheDocument();
  });

  it('distinguishes "no tickets yet" from "no tickets match these filters"', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [] });
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(screen.getByText('No tickets yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /clear filters/i }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'Closed');

    expect(
      await screen.findByText('No tickets match these filters'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /clear filters/i }).length,
    ).toBeGreaterThan(0);
  });

  it('clearing the filters restores the unfiltered list', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [makeTicket()] });
    const user = userEvent.setup();

    renderApp({ route: '/tickets?status=Closed' });
    await waitForList();
    expect(
      await screen.findByText('No tickets match these filters'),
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole('button', { name: /clear filters/i })[0],
    );

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  });

  it('renders an error state with a retry action', async () => {
    resetMockState({ currentUser: employeeUser });
    server.use(
      http.get(`${BASE}/tickets`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    renderApp({ route: '/tickets' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load tickets/i);
    // The raw backend detail is never shown.
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
    expect(
      within(alert).getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });
});

describe('ticket list — filters and URL state', () => {
  it('round-trips filter state through the URL search params', async () => {
    resetMockState({
      currentUser: agentUser,
      tickets: [
        makeTicket({ id: IDS.ticketA, subject: 'Open one', status: 'Open' }),
        makeTicket({
          id: IDS.ticketB,
          subject: 'Resolved one',
          status: 'Resolved',
          priority: 'High',
        }),
      ],
    });
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    await waitForList();

    await user.selectOptions(screen.getByLabelText('Status'), 'Resolved');

    await waitFor(() =>
      expect(
        table().queryByRole('link', { name: 'Open one' }),
      ).not.toBeInTheDocument(),
    );
    expect(table().getByRole('link', { name: 'Resolved one' })).toBeInTheDocument();
    // The select reflects the URL, which is the single source of truth.
    expect(screen.getByLabelText('Status')).toHaveValue('Resolved');
  });

  it('reads the initial filter state from the URL', async () => {
    resetMockState({
      currentUser: agentUser,
      tickets: [
        makeTicket({ id: IDS.ticketA, subject: 'Low one', priority: 'Low' }),
        makeTicket({
          id: IDS.ticketB,
          subject: 'Critical one',
          priority: 'Critical',
        }),
      ],
    });

    renderApp({ route: '/tickets?priority=Critical' });
    await waitForList();

    expect(screen.getByLabelText('Priority')).toHaveValue('Critical');
    expect(table().getByRole('link', { name: 'Critical one' })).toBeInTheDocument();
    expect(
      table().queryByRole('link', { name: 'Low one' }),
    ).not.toBeInTheDocument();
  });

  it('ignores an unrecognised status value in the URL', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });

    renderApp({ route: '/tickets?status=NotAStatus' });
    await waitForList();

    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('ignores a malformed category id in the URL rather than failing the page', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });

    // A bookmarked or hand-edited URL must not turn into a full-page failure
    // showing the backend's raw "categoryId must be a UUID".
    renderApp({ route: '/tickets?category=not-a-uuid' });
    await waitForList();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores an absurd offset rather than forwarding it to the API', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });

    renderApp({ route: '/tickets?offset=99999999999999999999' });
    await waitForList();

    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('ticket list — assignee filter', () => {
  it('offers staff "Anyone" and "Assigned to me" only', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });

    renderApp({ route: '/tickets' });
    await waitForList();

    const select = screen.getByLabelText('Assignee');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Anyone',
      'Assigned to me',
    ]);
    // "Unassigned" cannot be expressed with the API's assigneeId filter, so
    // it is not offered at all.
    expect(
      options.some((o) => /unassigned/i.test(o.textContent ?? '')),
    ).toBe(false);
  });

  it('filters by the signed-in agent when "Assigned to me" is chosen', async () => {
    resetMockState({
      currentUser: agentUser,
      tickets: [
        makeTicket({ id: IDS.ticketA, subject: 'Mine', assignee: {
          id: agentUser.id,
          firstName: 'Priya',
          lastName: 'Shah',
          role: 'SupportAgent',
        } }),
        makeTicket({ id: IDS.ticketB, subject: 'Unassigned one', assignee: null }),
      ],
    });
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    await waitForList();

    await user.selectOptions(screen.getByLabelText('Assignee'), 'me');

    await waitFor(() =>
      expect(
        table().queryByRole('link', { name: 'Unassigned one' }),
      ).not.toBeInTheDocument(),
    );
    expect(table().getByRole('link', { name: 'Mine' })).toBeInTheDocument();
  });

  it('hides the assignee filter from an Employee', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [makeTicket()] });

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(screen.queryByLabelText('Assignee')).not.toBeInTheDocument();
  });
});

describe('ticket list — pagination', () => {
  const manyTickets = Array.from({ length: 25 }, (_, index) =>
    makeTicket({
      id: `a${String(index).padStart(7, '0')}-1111-4111-8111-111111111111`,
      ticketNumber: 1000 + index,
      subject: `Ticket ${index}`,
    }),
  );

  it('reports the visible range and moves between pages', async () => {
    resetMockState({ currentUser: agentUser, tickets: manyTickets });
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    await waitForList();

    expect(
      screen.getByText(/showing 1–20 of 25 tickets \(page 1 of 2\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText(/showing 21–25 of 25 tickets \(page 2 of 2\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(table().getByRole('link', { name: 'Ticket 24' })).toBeInTheDocument();
  });

  it('resets to the first page when a filter changes', async () => {
    resetMockState({ currentUser: agentUser, tickets: manyTickets });
    const user = userEvent.setup();

    renderApp({ route: '/tickets?offset=20' });
    await waitForList();
    expect(await screen.findByText(/page 2 of 2/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Priority'), 'Medium');

    expect(await screen.findByText(/page 1 of 2/i)).toBeInTheDocument();
  });
});
