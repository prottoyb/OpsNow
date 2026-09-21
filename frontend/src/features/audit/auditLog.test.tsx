import { HttpResponse, delay, http } from 'msw';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '../../app/providers';
import { AppRoutes } from '../../app/router';
import {
  IDS,
  adminUser,
  agentUser,
  employeeUser,
  makeAuditLog,
  teamLeadUser,
} from '../../mocks/fixtures';
import { mockState, resetMockState } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { createTestQueryClient, renderApp } from '../../test/renderApp';

const BASE = '*/api/v1';

function lastParams(): URLSearchParams {
  const all = mockState.auditRequests;
  return all[all.length - 1].params;
}

/** Shows the router location so a test can assert the URL itself. */
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">{`${location.pathname}${location.search}`}</output>
  );
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

function search(): URLSearchParams {
  const text = screen.getByTestId('location').textContent ?? '';
  return new URLSearchParams(text.split('?')[1] ?? '');
}

async function openAudit(route = '/audit') {
  const utils = renderWithLocation(route);
  await screen.findByRole('heading', { name: 'Audit log' });
  return utils;
}

function seed(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeAuditLog({
      id: `e0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      createdAt: new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString(),
    }),
  );
}

const FAILED_LOGIN = makeAuditLog({
  id: 'e1000000-0000-4000-8000-000000000001',
  action: 'auth.login.failed',
  outcome: 'failure',
  entityType: null,
  entityId: null,
  actor: null,
  metadata: {
    outcome: 'failure',
    identifier: '<img src=x onerror=alert(1)>',
    reason: 'invalid_credentials',
  },
  ipAddress: '203.0.113.9',
  userAgent: 'Mozilla/5.0 (Test)',
  createdAt: '2026-03-03T08:00:00.000Z',
});

const TICKET_CREATED = makeAuditLog({
  id: 'e1000000-0000-4000-8000-000000000002',
  createdAt: '2026-03-02T10:15:00.000Z',
});

describe('audit log: table', () => {
  it('renders rows with a null actor and null IP / user-agent shown explicitly', async () => {
    resetMockState({
      currentUser: adminUser,
      auditLogs: [FAILED_LOGIN, TICKET_CREATED],
    });
    await openAudit();

    const rows = await screen.findAllByRole('row');
    // Header + two data rows, newest first.
    expect(rows).toHaveLength(3);
    const failed = within(rows[1]);
    const created = within(rows[2]);

    expect(failed.getByText('auth.login.failed')).toBeInTheDocument();
    expect(failed.getByText('Not attributed')).toBeInTheDocument();
    expect(failed.getByText('failure', { selector: 'span' })).toBeInTheDocument();
    expect(failed.getByText('203.0.113.9')).toBeInTheDocument();
    expect(failed.getByText('Mozilla/5.0 (Test)')).toBeInTheDocument();

    expect(created.getByText('ticket.created')).toBeInTheDocument();
    expect(created.getByText('Priya Shah')).toBeInTheDocument();
    expect(created.getByText('Ticket')).toBeInTheDocument();
    expect(created.getByText(IDS.ticketA)).toBeInTheDocument();
    // Null IP and user agent read as words, never a blank cell.
    expect(created.getAllByText('Not recorded')).toHaveLength(2);
    expect(created.getByText('TCK-1')).toBeInTheDocument();
    expect(created.getByText('ticketNumber')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('renders attacker-influenced metadata as text, never as markup', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: [FAILED_LOGIN] });
    const { container } = await openAudit();

    expect(
      await screen.findByText('<img src=x onerror=alert(1)>'),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows "Not recorded" for a null outcome and "None" for no entity', async () => {
    resetMockState({
      currentUser: adminUser,
      auditLogs: [
        makeAuditLog({ outcome: null, entityType: null, entityId: null, metadata: {} }),
      ],
    });
    await openAudit();

    const row = within((await screen.findAllByRole('row'))[1]);
    expect(row.getByText('None')).toBeInTheDocument();
    expect(row.getByText('None recorded')).toBeInTheDocument();
    // Outcome, IP and user agent.
    expect(row.getAllByText('Not recorded')).toHaveLength(3);
  });

  it('offers no edit or delete affordance', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(3) });
    await openAudit();
    await screen.findAllByRole('row');

    const main = within(screen.getByRole('main'));
    expect(main.queryByRole('button', { name: /edit|delete|remove|update/i })).toBeNull();
    expect(main.queryByRole('link', { name: /edit|delete|remove|update/i })).toBeNull();
    // Only pagination's controls exist as buttons.
    const names = main.queryAllByRole('button').map((b) => b.textContent);
    expect(names.sort()).toEqual(['Next', 'Previous']);
  });
});

describe('audit log: states', () => {
  it('shows a loading state, then the rows', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(2) });
    server.use(
      http.get(`${BASE}/audit-logs`, async () => {
        await delay(50);
        return HttpResponse.json({ data: seed(2), total: 2 });
      }),
    );
    await openAudit();

    expect(screen.getByText('Loading audit log…')).toBeInTheDocument();
    expect(await screen.findAllByRole('row')).toHaveLength(3);
  });

  it('shows an empty state when there is no audit history', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: [] });
    await openAudit();

    expect(await screen.findByText('No audit events yet')).toBeInTheDocument();
  });

  it('shows a filtered empty state with a way to clear', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: [TICKET_CREATED] });
    await openAudit('/audit?outcome=denied');

    expect(
      await screen.findByText('No audit events match these filters'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('main')).getAllByRole('button', { name: 'Clear filters' })[0],
    );
    await waitFor(() => expect(search().toString()).toBe(''));
  });

  it('explains a 403 without offering a pointless retry', async () => {
    resetMockState({ currentUser: adminUser });
    server.use(
      http.get(`${BASE}/audit-logs`, () =>
        HttpResponse.json(
          { statusCode: 403, message: 'Forbidden resource' },
          { status: 403 },
        ),
      ),
    );
    await openAudit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You do not have access to the audit log');
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('explains a 400 with the server messages and no retry', async () => {
    resetMockState({ currentUser: adminUser });
    server.use(
      http.get(`${BASE}/audit-logs`, () =>
        HttpResponse.json(
          { statusCode: 400, message: ['to must not be before from'] },
          { status: 400 },
        ),
      ),
    );
    await openAudit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The filters were not accepted');
    expect(alert).toHaveTextContent('to must not be before from');
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('offers a retry for a server error', async () => {
    resetMockState({ currentUser: adminUser });
    server.use(
      http.get(`${BASE}/audit-logs`, () =>
        HttpResponse.json({ statusCode: 500, message: 'Boom' }, { status: 500 }),
      ),
    );
    await openAudit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the audit log');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('audit log: filters', () => {
  it('writes each filter to the URL and refetches with the matching params', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(3) });
    await openAudit();
    await screen.findAllByRole('row');

    await userEvent.selectOptions(screen.getByLabelText('Action'), 'ticket.assigned');
    await waitFor(() => expect(search().get('action')).toBe('ticket.assigned'));
    await waitFor(() => expect(lastParams().get('action')).toBe('ticket.assigned'));

    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'denied');
    await userEvent.selectOptions(screen.getByLabelText('Entity type'), 'Asset');
    await waitFor(() => {
      expect(lastParams().get('outcome')).toBe('denied');
      expect(lastParams().get('entityType')).toBe('Asset');
      // Earlier filters are kept.
      expect(lastParams().get('action')).toBe('ticket.assigned');
    });
    expect(search().get('outcome')).toBe('denied');
    expect(search().get('entityType')).toBe('Asset');
  });

  it('sends UTC day bounds for the date range', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(1) });
    await openAudit('/audit?from=2026-03-01&to=2026-03-02');
    await screen.findAllByRole('row');

    expect(lastParams().get('from')).toBe('2026-03-01T00:00:00.000Z');
    expect(lastParams().get('to')).toBe('2026-03-02T23:59:59.999Z');
  });

  it('applies actor and entity ids only once they are complete UUIDs', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(1) });
    await openAudit();
    await screen.findAllByRole('row');
    const before = mockState.auditRequests.length;

    const actor = screen.getByLabelText('Actor ID');
    await userEvent.type(actor, 'not-a-uuid');
    expect(screen.getByText(/Enter a complete ID/)).toBeInTheDocument();
    expect(actor).toHaveAttribute('aria-invalid', 'true');
    expect(search().get('actor')).toBeNull();
    expect(mockState.auditRequests.length).toBe(before);

    await userEvent.clear(actor);
    await userEvent.click(actor);
    await userEvent.paste(IDS.agent);
    await waitFor(() => expect(search().get('actor')).toBe(IDS.agent));
    await waitFor(() => expect(lastParams().get('actorId')).toBe(IDS.agent));
  });

  it('filters by actor', async () => {
    resetMockState({
      currentUser: adminUser,
      auditLogs: [FAILED_LOGIN, TICKET_CREATED],
    });
    await openAudit(`/audit?actor=${IDS.agent}`);

    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText('Priya Shah')).toBeInTheDocument();
  });

  it('ignores malformed URL values instead of forwarding them', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(1) });
    await openAudit(
      '/audit?action=drop.table&outcome=maybe&entityType=Robot&actor=nope&entityId=1&from=2026-02-31&to=soon&offset=-5',
    );
    await screen.findAllByRole('row');

    const params = lastParams();
    for (const key of ['action', 'outcome', 'entityType', 'actorId', 'entityId', 'from', 'to']) {
      expect(params.has(key), key).toBe(false);
    }
    expect(params.get('offset')).toBe('0');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('does not request an inverted date range', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(1) });
    await openAudit('/audit?from=2026-03-05&to=2026-03-01');

    expect(
      await screen.findByText('The start date must not be after the end date.'),
    ).toBeInTheDocument();
    expect(mockState.auditRequests).toHaveLength(0);
  });
});

describe('audit log: pagination', () => {
  it('pages through the envelope via the offset in the URL', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(25) });
    await openAudit();

    expect(await screen.findAllByRole('row')).toHaveLength(21);
    expect(screen.getByText(/Showing 1–20 of 25 audit events/)).toBeInTheDocument();
    expect(lastParams().get('limit')).toBe('20');
    expect(lastParams().get('offset')).toBe('0');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(search().get('offset')).toBe('20'));
    await waitFor(() =>
      expect(screen.getByText(/Showing 21–25 of 25 audit events/)).toBeInTheDocument(),
    );
    expect(lastParams().get('offset')).toBe('20');
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('returns to the first page when a filter changes', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(25) });
    await openAudit('/audit?offset=20');
    await screen.findAllByRole('row');

    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'success');
    await waitFor(() => expect(search().has('offset')).toBe(false));
  });
});

describe('audit log: access control', () => {
  it.each([
    ['SupportAgent', agentUser],
    ['TeamLead', teamLeadUser],
    ['Employee', employeeUser],
  ])(
    'hides the nav entry from a %s, shows not-found at /audit and fires no request',
    async (_role, user) => {
      resetMockState({ currentUser: user, auditLogs: seed(2) });
      renderApp({ route: '/audit' });

      // The layout is up (the nav is rendered) before we assert its absence.
      await screen.findByRole('link', { name: 'Knowledge base' });
      expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Audit log' })).toBeNull();
      // Give any stray effect a chance to fire before asserting silence.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockState.auditRequests).toHaveLength(0);
    },
  );

  it('shows the nav entry to an Administrator and reaches the page from it', async () => {
    resetMockState({ currentUser: adminUser, auditLogs: seed(2) });
    renderApp({ route: '/tickets' });

    await userEvent.click(await screen.findByRole('link', { name: 'Audit log' }));
    expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
    expect(await screen.findAllByRole('row')).toHaveLength(3);
    expect(mockState.auditRequests.length).toBeGreaterThan(0);
  });
});
