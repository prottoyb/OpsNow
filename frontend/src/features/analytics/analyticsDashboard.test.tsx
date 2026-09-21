import { HttpResponse, delay, http } from 'msw';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../../app/providers';
import { AppRoutes } from '../../app/router';
import {
  IDS,
  agentUser,
  employeeUser,
  teamLeadUser,
} from '../../mocks/fixtures';
import { mockState, resetMockState } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { createTestQueryClient, renderApp } from '../../test/renderApp';

const BASE = '*/api/v1';

function requestsFor(route: string) {
  return mockState.analyticsRequests.filter((r) => r.route === route);
}

function lastRequest(route: string) {
  const all = requestsFor(route);
  return all[all.length - 1];
}

function panel(name: string) {
  return within(screen.getByRole('tabpanel', { name }));
}

/** The figure shown under a stat-tile label (`<dt>` then `<dd>`). */
function figure(scope: ReturnType<typeof within>, label: string): HTMLElement {
  const term = scope.getByText(label);
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) {
    throw new Error(`No figure next to "${label}"`);
  }
  return value;
}

async function openDashboard(route = '/dashboard') {
  const utils = renderApp({ route });
  await screen.findByRole('heading', { name: 'Dashboard' });
  return utils;
}

async function openTab(name: string) {
  await userEvent.click(screen.getByRole('tab', { name }));
  return panel(name);
}

describe('analytics dashboard: ticket analytics', () => {
  it('renders every figure from the response', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard();

    const tickets = panel('Tickets');
    expect(await tickets.findByText('Tickets created in window')).toBeInTheDocument();
    expect(figure(tickets, 'Tickets created in window')).toHaveTextContent('48');
    expect(figure(tickets, 'Tickets resolved in window')).toHaveTextContent('41');
    expect(figure(tickets, 'Current backlog')).toHaveTextContent('17');
    expect(figure(tickets, 'All matching tickets')).toHaveTextContent('140');
    expect(figure(tickets, 'Mean resolution time')).toHaveTextContent('3h 5m');
    expect(figure(tickets, 'Median resolution time')).toHaveTextContent('2h');

    // Bars carry a name and a value, not just a length.
    const high = tickets.getByRole('meter', { name: 'Tickets by priority: High' });
    expect(high).toHaveAttribute('aria-valuenow', '12');
    expect(high).toHaveAttribute('aria-valuetext', expect.stringContaining('12 tickets'));
    expect(
      tickets.getByRole('meter', { name: 'Tickets by status: In progress' }),
    ).toHaveAttribute('aria-valuenow', '6');
  });

  it('shows "No data" for null durations, never 0m or "Due now"', async () => {
    resetMockState({
      currentUser: agentUser,
      ticketAnalytics: {
        ...mockState.ticketAnalytics,
        resolved: 0,
        resolution: { resolvedCount: 0, meanMinutes: null, medianMinutes: null },
      },
    });
    await openDashboard();

    const tickets = panel('Tickets');
    await tickets.findByText('Mean resolution time');
    expect(figure(tickets, 'Mean resolution time')).toHaveTextContent('No data');
    expect(figure(tickets, 'Median resolution time')).toHaveTextContent('No data');
    expect(tickets.queryByText('0m')).not.toBeInTheDocument();
    expect(tickets.queryByText(/due now/i)).not.toBeInTheDocument();
  });

  it('shows a genuine zero-minute average as 0m, not as no data', async () => {
    resetMockState({
      currentUser: agentUser,
      ticketAnalytics: {
        ...mockState.ticketAnalytics,
        resolution: { resolvedCount: 3, meanMinutes: 0, medianMinutes: 0 },
      },
    });
    await openDashboard();

    const tickets = panel('Tickets');
    await tickets.findByText('Mean resolution time');
    expect(figure(tickets, 'Mean resolution time')).toHaveTextContent('0m');
  });
});

describe('analytics dashboard: SLA analytics', () => {
  it('renders compliance, met/breached, overdue and at-risk per clock', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard();
    const sla = await openTab('SLA');

    const response = within(await sla.findByRole('region', { name: 'Response' }));
    expect(response.getByText('75%')).toBeInTheDocument();
    expect(response.getByText('30 met, 10 breached')).toBeInTheDocument();
    expect(figure(response, 'Overdue (still open)')).toHaveTextContent('2');
    expect(figure(response, 'At risk')).toHaveTextContent('3');
    expect(
      response.getByRole('meter', { name: 'Response SLA compliance' }),
    ).toHaveAttribute('aria-valuenow', '75');

    const resolution = within(sla.getByRole('region', { name: 'Resolution' }));
    expect(resolution.getByText('83.3%')).toBeInTheDocument();
    expect(figure(sla, 'Tickets created in window with an SLA')).toHaveTextContent('46');
  });

  it('renders a null complianceRate as "no completed clocks", not 0%', async () => {
    resetMockState({
      currentUser: agentUser,
      slaAnalytics: {
        ...mockState.slaAnalytics,
        response: {
          met: 0,
          breached: 0,
          complianceRate: null,
          inFlightBreached: 1,
          atRisk: 0,
        },
      },
    });
    await openDashboard();
    const sla = await openTab('SLA');

    const response = within(await sla.findByRole('region', { name: 'Response' }));
    expect(
      response.getByText('No completed clocks in this window'),
    ).toBeInTheDocument();
    expect(response.queryByText('0%')).not.toBeInTheDocument();
    expect(response.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('renders a real 0 rate as 0% with an empty meter (the opposite case)', async () => {
    resetMockState({
      currentUser: agentUser,
      slaAnalytics: {
        ...mockState.slaAnalytics,
        response: {
          met: 0,
          breached: 4,
          complianceRate: 0,
          inFlightBreached: 0,
          atRisk: 0,
        },
      },
    });
    await openDashboard();
    const sla = await openTab('SLA');

    const response = within(await sla.findByRole('region', { name: 'Response' }));
    expect(response.getByText('0%')).toBeInTheDocument();
    expect(response.getByText('0 met, 4 breached')).toBeInTheDocument();
    expect(response.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    expect(
      response.queryByText('No completed clocks in this window'),
    ).not.toBeInTheDocument();
  });
});

describe('analytics dashboard: category statistics', () => {
  it('renders volume, resolved, average resolution and breaches, busiest first', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard();
    const categories = await openTab('Categories');

    const network = within(await categories.findByRole('row', { name: /Network/ }));
    expect(network.getByRole('meter', { name: 'Network ticket volume' })).toHaveAttribute(
      'aria-valuenow',
      '20',
    );
    expect(network.getByText('1h 35m')).toBeInTheDocument();

    // Uncategorised is named, and a null average is "No data" not 0m.
    const software = within(categories.getByRole('row', { name: /Software/ }));
    expect(software.getByText('No data')).toBeInTheDocument();
    expect(categories.getByRole('row', { name: /Uncategorised/ })).toBeInTheDocument();
  });

  it('says so when the backend truncated the list', async () => {
    resetMockState({
      currentUser: agentUser,
      categoryAnalytics: { ...mockState.categoryAnalytics, truncated: true },
    });
    await openDashboard();
    const categories = await openTab('Categories');
    expect(await categories.findByText(/only the busiest categories/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing matched', async () => {
    resetMockState({
      currentUser: agentUser,
      categoryAnalytics: { ...mockState.categoryAnalytics, categories: [] },
    });
    await openDashboard();
    const categories = await openTab('Categories');
    expect(await categories.findByText('No tickets in this window')).toBeInTheDocument();
  });
});

describe('analytics dashboard: agent performance and RBAC', () => {
  it('offers agent performance to a TeamLead and renders it, with null compliance distinct from 0%', async () => {
    resetMockState({
      currentUser: teamLeadUser,
      agentAnalytics: {
        ...mockState.agentAnalytics,
        agents: [
          ...mockState.agentAnalytics.agents,
          {
            agentId: IDS.employee,
            agentName: 'Zed Zero',
            assigned: 5,
            resolved: 2,
            avgResolutionMinutes: 60,
            resolutionMet: 0,
            resolutionBreached: 2,
            slaComplianceRate: 0,
          },
        ],
      },
    });
    await openDashboard();
    const agents = await openTab('Agent performance');

    const priya = within(await agents.findByRole('row', { name: /Priya Shah/ }));
    expect(priya.getByText('83.3%')).toBeInTheDocument();
    expect(priya.getByText('15 met, 3 breached')).toBeInTheDocument();

    const marco = within(agents.getByRole('row', { name: /Marco Rossi/ }));
    expect(marco.getByText('No resolved tickets')).toBeInTheDocument();
    expect(marco.getByText('No data')).toBeInTheDocument();
    expect(marco.queryByText('0%')).not.toBeInTheDocument();

    const zed = within(agents.getByRole('row', { name: /Zed Zero/ }));
    expect(zed.getByText('0%')).toBeInTheDocument();
    expect(zed.getByText('0 met, 2 breached')).toBeInTheDocument();
  });

  it('does not offer agent performance to a SupportAgent, and never requests it', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard();

    expect(screen.getByRole('tab', { name: 'Tickets' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'SLA' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Categories' })).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Agent performance' }),
    ).not.toBeInTheDocument();

    // Visit every tab they do have, then check nothing asked for agents.
    await openTab('SLA');
    await openTab('Categories');
    await waitFor(() => expect(requestsFor('categories')).toHaveLength(1));
    expect(requestsFor('agents')).toHaveLength(0);
  });

  it('falls back to the first tab when a SupportAgent opens a ?tab=agents link', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard('/dashboard?tab=agents');

    expect(screen.getByRole('tab', { name: 'Tickets', selected: true })).toBeInTheDocument();
    await panel('Tickets').findByText('Tickets created in window');
    expect(requestsFor('agents')).toHaveLength(0);
  });

  it('gives an Employee the ordinary not-found page and fires no request', async () => {
    resetMockState({ currentUser: employeeUser });
    renderApp({ route: '/dashboard' });

    expect(await screen.findByText(/page not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(mockState.analyticsRequests).toHaveLength(0);
  });

  it('shows the Dashboard nav link to staff', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('only requests the visible tab, then each other tab once when opened', async () => {
    resetMockState({ currentUser: teamLeadUser });
    await openDashboard();
    await panel('Tickets').findByText('Tickets created in window');
    expect(mockState.analyticsRequests.map((r) => r.route)).toEqual(['tickets']);

    await openTab('Agent performance');
    await waitFor(() => expect(requestsFor('agents')).toHaveLength(1));
  });
});

/** Shows the router location so a test can assert the URL itself. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderWithLocation(route: string) {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders queryClient={queryClient}>
        <AppRoutes />
        <LocationProbe />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('analytics dashboard: filters', () => {
  it('sends no dates by default, leaving the 30-day default to the backend', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard();
    await panel('Tickets').findByText('Tickets created in window');

    const params = lastRequest('tickets').params;
    expect(params.has('from')).toBe(false);
    expect(params.has('to')).toBe(false);
    expect(params.has('priority')).toBe(false);
  });

  it('writes filter changes to the URL and refetches with the matching query', async () => {
    resetMockState({ currentUser: agentUser });
    renderWithLocation('/dashboard');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await panel('Tickets').findByText('Tickets created in window');
    // Categories arrive asynchronously; the option must exist before selecting.
    await screen.findByRole('option', { name: 'Network' });

    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'High');
    await userEvent.selectOptions(screen.getByLabelText('Category'), IDS.categoryNetwork);
    await userEvent.click(screen.getByLabelText('Assigned to me'));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-10' } });

    await waitFor(() => {
      const params = lastRequest('tickets').params;
      expect(params.get('priority')).toBe('High');
      expect(params.get('categoryId')).toBe(IDS.categoryNetwork);
      expect(params.get('assigneeId')).toBe(IDS.agent);
      expect(params.get('from')).toBe('2026-09-01T00:00:00.000Z');
      expect(params.get('to')).toBe('2026-09-10T23:59:59.999Z');
    });

    const url = new URL(screen.getByTestId('location').textContent ?? '', 'http://x');
    expect(url.searchParams.get('priority')).toBe('High');
    expect(url.searchParams.get('category')).toBe(IDS.categoryNetwork);
    expect(url.searchParams.get('assignee')).toBe('me');
    expect(url.searchParams.get('from')).toBe('2026-09-01');
    expect(url.searchParams.get('to')).toBe('2026-09-10');
  });

  it('restores the filters and the tab from a shared URL', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard(
      `/dashboard?tab=sla&priority=Critical&category=${IDS.categoryNetwork}&assignee=me&from=2026-09-01&to=2026-09-10`,
    );

    expect(screen.getByRole('tab', { name: 'SLA', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toHaveValue('Critical');
    expect(screen.getByLabelText('Assigned to me')).toBeChecked();
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');

    await panel('SLA').findByText('Tickets created in window with an SLA');
    const params = lastRequest('sla').params;
    expect(params.get('priority')).toBe('Critical');
    expect(params.get('assigneeId')).toBe(IDS.agent);
    expect(requestsFor('tickets')).toHaveLength(0);
  });

  it('ignores malformed URL values instead of forwarding them', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard(
      '/dashboard?priority=Urgent&category=not-a-uuid&from=2026-02-31&to=soon&assignee=someone',
    );
    await panel('Tickets').findByText('Tickets created in window');

    const params = lastRequest('tickets').params;
    expect([...params.keys()]).toEqual([]);
  });

  it('clears every filter', async () => {
    resetMockState({ currentUser: agentUser });
    renderWithLocation('/dashboard?priority=High&assignee=me');
    await screen.findByRole('heading', { name: 'Dashboard' });

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/),
    );
    expect(screen.getByLabelText('Priority')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows inline guidance for a range over 366 days and never sends it', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard('/dashboard?from=2024-01-01&to=2026-09-01');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a range of at most 366 days.',
    );
    expect(screen.getByLabelText('From')).toBeInvalid();
    // Nothing reaches the backend for a range that could only 400, and no
    // panel is left showing figures for a different range.
    expect(mockState.analyticsRequests).toHaveLength(0);
    expect(screen.queryByText('Tickets created in window')).not.toBeInTheDocument();
  });

  it('shows guidance for an inverted range and recovers once it is fixed', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard('/dashboard?from=2026-09-10&to=2026-09-01');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The start date must not be after the end date.',
    );
    expect(mockState.analyticsRequests).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } });
    await panel('Tickets').findByText('Tickets created in window');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lastRequest('tickets').params.get('from')).toBe('2026-08-01T00:00:00.000Z');
  });

  it('documents the assignee limitation on the page', async () => {
    resetMockState({ currentUser: agentUser });
    await openDashboard();
    expect(screen.getByText(/no staff directory/i)).toBeInTheDocument();
  });
});

describe('analytics dashboard: loading and errors', () => {
  it('shows a status while the first response is in flight', async () => {
    resetMockState({ currentUser: agentUser });
    server.use(
      http.get(`${BASE}/analytics/tickets`, async () => {
        await delay(80);
        return HttpResponse.json(mockState.ticketAnalytics);
      }),
    );
    await openDashboard();

    expect(await screen.findByText('Loading ticket analytics')).toBeInTheDocument();
    expect(await panel('Tickets').findByText('Tickets created in window')).toBeInTheDocument();
    expect(screen.queryByText('Loading ticket analytics')).not.toBeInTheDocument();
  });

  it('explains a 403 without offering a pointless retry', async () => {
    resetMockState({ currentUser: teamLeadUser });
    server.use(
      http.get(`${BASE}/analytics/agents`, () =>
        HttpResponse.json(
          { statusCode: 403, message: 'Forbidden resource' },
          { status: 403 },
        ),
      ),
    );
    await openDashboard();
    await openTab('Agent performance');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You do not have access to agent performance');
    expect(within(alert).queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('shows the backend validation messages for a 400, without a retry', async () => {
    resetMockState({ currentUser: agentUser });
    server.use(
      http.get(`${BASE}/analytics/tickets`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: ['The reporting window may span at most 366 days'],
          },
          { status: 400 },
        ),
      ),
    );
    await openDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The filters were not accepted for ticket analytics');
    expect(alert).toHaveTextContent('The reporting window may span at most 366 days');
    expect(within(alert).queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('offers a retry after a server error and recovers', async () => {
    resetMockState({ currentUser: agentUser });
    let fail = true;
    server.use(
      http.get(`${BASE}/analytics/tickets`, () =>
        fail
          ? HttpResponse.json({ statusCode: 500, message: 'boom' }, { status: 500 })
          : HttpResponse.json(mockState.ticketAnalytics),
      ),
    );
    await openDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load ticket analytics');
    // A 5xx body is never shown verbatim.
    expect(alert).not.toHaveTextContent('boom');

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await panel('Tickets').findByText('Tickets created in window')).toBeInTheDocument();
  });

  it('keeps one tab failing from blanking another', async () => {
    resetMockState({ currentUser: agentUser });
    server.use(
      http.get(`${BASE}/analytics/tickets`, () =>
        HttpResponse.json({ statusCode: 500, message: 'boom' }, { status: 500 }),
      ),
    );
    await openDashboard();
    await screen.findByRole('alert');

    const sla = await openTab('SLA');
    expect(await sla.findByRole('region', { name: 'Response' })).toBeInTheDocument();
  });
});
