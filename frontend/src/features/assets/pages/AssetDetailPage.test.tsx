import { HttpResponse, http } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  employeeSummary,
  employeeUser,
  makeAsset,
  makeAssignment,
} from '../../../mocks/fixtures';
import { mockState, resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/renderApp';
import type { Asset, AssetAssignment } from '../../../types/api';

const BASE = '*/api/v1';
const ROUTE = `/assets/${IDS.assetA}`;

afterEach(() => {
  server.events.removeAllListeners();
});

function seed(
  who: typeof employeeUser | typeof agentUser,
  asset: Partial<Asset> = {},
  assignments: AssetAssignment[] = [],
) {
  resetMockState({
    currentUser: who,
    assets: [makeAsset({ id: IDS.assetA, ...asset })],
    assetAssignments: assignments,
  });
}

async function renderDetail(route = ROUTE) {
  renderApp({ route });
  await screen.findByRole('heading', { name: /LAPTOP-0001/ });
}

describe('asset detail — staff', () => {
  it('shows edit, status and assignment controls plus the History tab', async () => {
    seed(agentUser);

    await renderDetail();

    expect(
      screen.getByRole('button', { name: 'Edit details' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Assign to me' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move to Retired' }),
    ).toBeInTheDocument();
  });

  it('shows the assignment history once the History tab is opened', async () => {
    seed(agentUser, {}, [makeAssignment({ assetId: IDS.assetA })]);
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('tab', { name: 'History' }));

    expect(await screen.findByText('Current holding')).toBeInTheDocument();
  });
});

describe('asset detail — Employee', () => {
  it('has no edit, status or assignment-action controls, and no History tab', async () => {
    seed(employeeUser, {
      status: 'Assigned',
      currentAssignee: employeeSummary,
    });

    await renderDetail();

    expect(
      screen.queryByRole('button', { name: /edit details/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /move to /i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /assign to me/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /return to stock/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
    // A read-only summary is still shown.
    expect(screen.getByText(/Assigned to:/)).toBeInTheDocument();
  });

  it('never issues a request to the staff-only assignments endpoint', async () => {
    seed(employeeUser, {
      status: 'Assigned',
      currentAssignee: employeeSummary,
    });

    const requested: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requested.push(new URL(request.url).pathname);
    });

    await renderDetail();
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));

    expect(requested.filter((path) => path.includes('assignments'))).toEqual(
      [],
    );
  });
});

describe('asset detail — failure states', () => {
  it('shows a 404 without hinting the asset might belong to someone else', async () => {
    resetMockState({ currentUser: employeeUser, assets: [] });

    renderApp({ route: ROUTE });

    expect(
      await screen.findByRole('heading', { name: 'Asset not found' }),
    ).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(
      /not yours|someone else|another user|no access|assigned to someone/i,
    );
  });

  it('handles a malformed id, which ParseUUIDPipe rejects as 400 not 404', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/assets/garbage' });

    expect(
      await screen.findByRole('heading', { name: 'Invalid asset reference' }),
    ).toBeInTheDocument();
  });

  it('explains a 409 conflict from the assignment endpoint and reloads the asset', async () => {
    seed(agentUser, { status: 'InStock' });
    server.use(
      http.patch(`${BASE}/assets/:id/assignment`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'Asset was modified by another request; reload and retry',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));

    expect(
      await screen.findByText(/someone else changed this asset/i),
    ).toBeInTheDocument();
  });

  it('explains a 403 from an edit and closes the edit form', async () => {
    seed(agentUser);
    server.use(
      http.patch(`${BASE}/assets/:id`, () =>
        HttpResponse.json(
          { statusCode: 403, message: 'Only staff can update an asset' },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const name = screen.getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'New name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('Only staff can update an asset'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows a 400 from the assignment endpoint inline, not as the page-level notice', async () => {
    seed(agentUser, { status: 'InStock', currentAssignee: null });
    server.use(
      http.patch(`${BASE}/assets/:id/assignment`, () =>
        HttpResponse.json(
          { statusCode: 400, message: 'Asset is already unassigned' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));

    expect(
      await screen.findByText('Asset is already unassigned'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/someone else changed this asset/i),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error when the asset cannot be loaded', async () => {
    resetMockState({ currentUser: employeeUser });
    server.use(
      http.get(`${BASE}/assets/:id`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    renderApp({ route: ROUTE });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load this asset/i);
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
  });
});

describe('asset detail — mutations', () => {
  it('sends only the changed fields when editing, and never a status key', async () => {
    seed(agentUser, { name: 'Old name', notes: 'Old notes' });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/assets/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeAsset({ id: IDS.assetA, name: 'New name', notes: 'Old notes' }),
        );
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const name = screen.getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'New name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(body.name).toBe('New name'));
    expect(Object.keys(body)).toEqual(['name']);
    expect(body).not.toHaveProperty('status');
  });

  it('sends an explicit null to clear an optional field', async () => {
    seed(agentUser, { serialNumber: 'SN-0001' });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/assets/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeAsset({ id: IDS.assetA, serialNumber: null }),
        );
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const serial = screen.getByLabelText(/serial number/i);
    await user.clear(serial);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect('serialNumber' in body).toBe(true));
    expect(body.serialNumber).toBeNull();
    expect(Object.keys(body)).toEqual(['serialNumber']);
  });

  /*
   * The date fields go through the subtlest path in the feature:
   * `toDateInputValue` -> native <input type="date"> -> `diffOptionalDate`
   * -> the backend's strict ISO-8601 validator. Covered explicitly because a
   * regression anywhere along it is invisible to the other diff tests, which
   * only exercise string fields.
   */
  it('sends a changed date as YYYY-MM-DD and nothing else', async () => {
    seed(agentUser, { purchaseDate: '2025-01-15T00:00:00.000Z' });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/assets/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeAsset({
            id: IDS.assetA,
            purchaseDate: '2025-03-02T00:00:00.000Z',
          }),
        );
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const purchase = screen.getByLabelText(/purchase date/i);
    await user.clear(purchase);
    await user.type(purchase, '2025-03-02');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(body.purchaseDate).toBe('2025-03-02'));
    expect(Object.keys(body)).toEqual(['purchaseDate']);
  });

  it('sends an explicit null to clear a date', async () => {
    seed(agentUser, { purchaseDate: '2025-01-15T00:00:00.000Z' });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/assets/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeAsset({ id: IDS.assetA, purchaseDate: null }),
        );
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText(/purchase date/i));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect('purchaseDate' in body).toBe(true));
    expect(body.purchaseDate).toBeNull();
    expect(Object.keys(body)).toEqual(['purchaseDate']);
  });

  it('omits an untouched date even when another field changes', async () => {
    // The round trip must not make an unchanged date look changed: the ISO
    // timestamp in, the YYYY-MM-DD the input shows, and the value compared on
    // submit are three different shapes of the same day.
    seed(agentUser, {
      name: 'Old name',
      purchaseDate: '2025-01-15T00:00:00.000Z',
      warrantyExpiresAt: '2028-01-15T00:00:00.000Z',
    });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/assets/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeAsset({ id: IDS.assetA, name: 'New name' }));
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const name = screen.getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'New name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(body.name).toBe('New name'));
    expect(Object.keys(body)).toEqual(['name']);
    expect(body).not.toHaveProperty('purchaseDate');
    expect(body).not.toHaveProperty('warrantyExpiresAt');
  });

  it('renders a date-only field on the stored calendar day', async () => {
    // TZ is pinned to a negative-offset zone in vitest.config.ts, so a
    // date-time formatter here would render 14 January, not 15.
    seed(agentUser, { purchaseDate: '2025-01-15T00:00:00.000Z' });

    await renderDetail();

    const purchased = await screen.findByText(/purchased/i);
    const value = purchased.nextElementSibling?.textContent ?? '';
    expect(value).toMatch(/\b15\b/);
    expect(value).not.toMatch(/\b14\b/);
    // No time component on a date-only column.
    expect(value).not.toMatch(/\d:\d{2}/);
  });

  it('sends no request at all when Save is pressed with nothing changed', async () => {
    seed(agentUser);
    let called = false;
    server.use(
      http.patch(`${BASE}/assets/:id`, async ({ request }) => {
        called = true;
        return HttpResponse.json(await request.json());
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument(),
    );
    expect(called).toBe(false);
  });

  it('changes status via the status control, sending only the status key', async () => {
    seed(agentUser, { status: 'InStock' });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/assets/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeAsset({ id: IDS.assetA, status: 'Retired' }));
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Move to Retired' }));

    await waitFor(() => expect(body.status).toBe('Retired'));
    expect(Object.keys(body)).toEqual(['status']);
    expect(
      await screen.findByText(/status changed to retired/i),
    ).toBeInTheDocument();
  });

  it('assigns to the signed-in agent and then returns the asset to stock', async () => {
    seed(agentUser, { status: 'InStock', currentAssignee: null });
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));

    expect(
      await screen.findByText(/asset assigned to you/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mockState.assets[0].currentAssignee?.id).toBe(agentUser.id),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Return to stock' }),
    );

    expect(
      await screen.findByText(/asset returned to stock/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockState.assets[0].currentAssignee).toBeNull());
  });
});
