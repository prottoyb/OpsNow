import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  agentUser,
  employeeUser,
  makeTicket,
  slaPolicies,
} from '../../../mocks/fixtures';
import { coreHandlers, resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp, renderWithProviders } from '../../../test/renderApp';
import { SlaDashboardPage } from './SlaDashboardPage';

const BASE = '*/api/v1';

const METRIC_LABELS = [
  'Open tickets with an SLA',
  'Resolution overdue (still open)',
  'Resolution breached (already resolved)',
  'Responded on time',
  'Responded late',
  'Response overdue (no reply yet)',
  'Resolved with no response',
];

afterEach(() => {
  server.events.removeAllListeners();
});

describe('SLA dashboard — staff', () => {
  it('renders every metric and the policy table', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });

    renderApp({ route: '/sla' });
    await screen.findByRole('heading', { level: 1, name: 'SLA' });

    for (const label of METRIC_LABELS) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    // Values come from the API, rendered as a definition list — not a chart.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();

    const policyTable = within(await screen.findByRole('table'));
    for (const header of [
      'Policy',
      'Priority',
      'Response target',
      'Resolution target',
      'Status',
    ]) {
      expect(
        policyTable.getByRole('columnheader', { name: header }),
      ).toBeInTheDocument();
    }
    expect(policyTable.getByText('Critical priority')).toBeInTheDocument();
    // Targets are shown as durations, not raw minute counts.
    expect(policyTable.getByText('15m')).toBeInTheDocument();
    expect(policyTable.getByText('8h')).toBeInTheDocument();
    expect(policyTable.getByText('1d')).toBeInTheDocument();
    // Active and inactive are spelled out, never colour alone.
    expect(policyTable.getAllByText('Active')).toHaveLength(2);
    expect(policyTable.getByText('Inactive')).toBeInTheDocument();
  });

  it('says plainly that an at-risk total is not available, rather than inventing one', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });

    renderApp({ route: '/sla' });

    expect(
      await screen.findByText(/An at-risk total is not available/i),
    ).toBeInTheDocument();
  });

  it('reaches the dashboard from the staff-only nav link', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    const nav = within(
      await screen.findByRole('navigation', { name: 'Main' }),
    );

    await user.click(nav.getByRole('link', { name: 'SLA' }));

    expect(
      await screen.findByRole('heading', { name: 'Service level metrics' }),
    ).toBeInTheDocument();
  });

  it('shows an empty state when no policies are configured', async () => {
    resetMockState({
      currentUser: agentUser,
      tickets: [makeTicket()],
      slaPolicies: [],
    });

    renderApp({ route: '/sla' });

    expect(
      await screen.findByText('No SLA policies are configured'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

/**
 * The two sections are independent queries and must fail independently: a
 * dashboard that blanks entirely because one of two endpoints is down is
 * strictly less useful than one that shows what it still has.
 */
describe('SLA dashboard — partial failure', () => {
  it('keeps the policy table when the metrics endpoint fails', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });
    server.use(
      http.get(`${BASE}/sla/metrics`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    renderApp({ route: '/sla' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load sla metrics/i);
    // The raw backend detail is never surfaced.
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);

    const policyTable = within(await screen.findByRole('table'));
    expect(policyTable.getByText('High priority')).toBeInTheDocument();
    expect(screen.queryByText('Open tickets with an SLA')).not.toBeInTheDocument();
  });

  it('keeps the metrics when the policies endpoint fails', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });
    server.use(
      http.get(`${BASE}/sla-policies`, () =>
        HttpResponse.json({ statusCode: 500, message: 'boom' }, { status: 500 }),
      ),
    );

    renderApp({ route: '/sla' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load sla policies/i);
    expect(await screen.findByText('Open tickets with an SLA')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByText(slaPolicies[0].name),
    ).not.toBeInTheDocument();
  });
});

describe('SLA dashboard — non-staff', () => {
  it('does not offer the nav link to an Employee', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [makeTicket()] });

    renderApp({ route: '/tickets' });
    const nav = within(
      await screen.findByRole('navigation', { name: 'Main' }),
    );

    expect(nav.queryByRole('link', { name: 'SLA' })).not.toBeInTheDocument();
  });

  it('falls through to "page not found" when an Employee deep-links to it', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [makeTicket()] });

    renderApp({ route: '/sla' });

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Service level metrics')).not.toBeInTheDocument();
  });

  /**
   * The access control is the backend's `@Roles()` guard — this only proves
   * the client never even asks. MSW is started here WITHOUT the SLA handlers
   * so an unexpected request would also trip `onUnhandledRequest: 'error'`,
   * and every outgoing request is recorded so the assertion is exact rather
   * than dependent on how loudly MSW complains.
   */
  it('never issues a request to either staff-only SLA endpoint', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [makeTicket()] });
    server.resetHandlers(...coreHandlers);

    const requested: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requested.push(new URL(request.url).pathname);
    });

    const user = userEvent.setup();
    renderApp({ route: '/tickets' });
    await screen.findByRole('heading', { level: 1, name: 'Tickets' });

    // Visit a ticket (its SLA panel renders from the ticket payload alone).
    // The desktop table and the mobile card list render the same row, so the
    // first match is taken rather than requiring a unique one.
    await user.click((await screen.findAllByRole('link', { name: /Laptop/ }))[0]);
    await screen.findByRole('heading', { level: 2, name: 'SLA' });

    // …and then try the dashboard route directly.
    renderApp({ route: '/sla' });
    await screen.findAllByRole('heading', { name: 'Page not found' });

    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    expect(requested.filter((path) => path.includes('sla'))).toEqual([]);
  });

  /**
   * The route gate is what an Employee actually meets, so the test above
   * cannot tell whether the queries' own `enabled: isStaff` works. This one
   * mounts the page directly, past the gate, and proves the second layer
   * holds on its own.
   */
  it('issues no request even if the page itself is mounted for an Employee', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [makeTicket()] });
    server.resetHandlers(...coreHandlers);

    const requested: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requested.push(new URL(request.url).pathname);
    });

    renderWithProviders(<SlaDashboardPage />);
    await screen.findByRole('heading', { level: 1, name: 'SLA' });

    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    expect(requested.filter((path) => path.includes('sla'))).toEqual([]);
    // Nothing rendered from staff-only data either.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Open tickets with an SLA')).not.toBeInTheDocument();
  });
});
