import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IDS, agentUser, employeeUser, makeAsset } from '../../../mocks/fixtures';
import { resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/renderApp';

const BASE = '*/api/v1';

/** The table and the mobile card list render the same rows; scope to one. */
function table() {
  return within(screen.getByRole('table'));
}

async function waitForList() {
  await screen.findByRole('heading', { level: 1 });
  await waitFor(() =>
    expect(screen.queryByText(/loading assets/i)).not.toBeInTheDocument(),
  );
}

describe('asset list — states', () => {
  it('shows a loading state before the first page arrives', async () => {
    resetMockState({ currentUser: agentUser, assets: [makeAsset()] });

    renderApp({ route: '/assets' });

    expect(await screen.findByText(/loading assets/i)).toBeInTheDocument();
    await waitForList();
  });

  it('renders assets in a table with column headers', async () => {
    resetMockState({
      currentUser: agentUser,
      assets: [makeAsset({ assetTag: 'LAPTOP-9001', name: 'Dell Latitude' })],
    });

    renderApp({ route: '/assets' });
    await waitForList();

    expect(
      table().getByRole('columnheader', { name: 'Asset tag' }),
    ).toBeInTheDocument();
    expect(
      table().getByRole('link', { name: 'LAPTOP-9001' }),
    ).toBeInTheDocument();
    expect(table().getByText('Dell Latitude')).toBeInTheDocument();
    expect(table().getByText('In stock')).toBeInTheDocument();
  });

  it('renders an error state with a retry action', async () => {
    resetMockState({ currentUser: agentUser });
    server.use(
      http.get(`${BASE}/assets`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    renderApp({ route: '/assets' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load assets/i);
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
    expect(
      within(alert).getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('distinguishes "nothing yet" from "no matches" — staff copy', async () => {
    resetMockState({ currentUser: agentUser, assets: [] });
    const user = userEvent.setup();

    renderApp({ route: '/assets' });
    await waitForList();

    expect(screen.getByText('No assets yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /clear filters/i }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'Retired');

    expect(
      await screen.findByText('No assets match these filters'),
    ).toBeInTheDocument();
  });

  it('shows Employee-specific copy for an empty row-scoped list', async () => {
    resetMockState({ currentUser: employeeUser, assets: [] });

    renderApp({ route: '/assets' });
    await waitForList();

    expect(screen.getByText('No equipment assigned')).toBeInTheDocument();
  });
});

describe('asset list — pagination', () => {
  const manyAssets = Array.from({ length: 25 }, (_, index) =>
    makeAsset({
      id: `7${String(index).padStart(7, '0')}-1111-4111-8111-111111111111`,
      assetTag: `LAPTOP-${String(index).padStart(4, '0')}`,
      name: `Laptop ${index}`,
    }),
  );

  it('reports the visible range and moves between pages', async () => {
    resetMockState({ currentUser: agentUser, assets: manyAssets });
    const user = userEvent.setup();

    renderApp({ route: '/assets' });
    await waitForList();

    expect(
      screen.getByText(/showing 1–20 of 25 assets \(page 1 of 2\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText(/showing 21–25 of 25 assets \(page 2 of 2\)/i),
    ).toBeInTheDocument();
    expect(
      table().getByRole('link', { name: 'LAPTOP-0024' }),
    ).toBeInTheDocument();
  });
});

describe('asset list — role differences', () => {
  it('offers "New asset" and the staff nav label to staff', async () => {
    resetMockState({ currentUser: agentUser, assets: [makeAsset()] });

    renderApp({ route: '/assets' });
    await waitForList();

    expect(
      screen.getByRole('link', { name: 'New asset' }),
    ).toBeInTheDocument();
    const nav = within(
      screen.getByRole('navigation', { name: 'Main' }),
    );
    expect(nav.getByRole('link', { name: 'Assets' })).toBeInTheDocument();
  });

  it('does not offer "New asset" to an Employee, and labels the nav "My assets"', async () => {
    resetMockState({ currentUser: employeeUser, assets: [] });

    renderApp({ route: '/assets' });
    await waitForList();

    expect(
      screen.queryByRole('link', { name: 'New asset' }),
    ).not.toBeInTheDocument();
    const nav = within(
      screen.getByRole('navigation', { name: 'Main' }),
    );
    expect(nav.getByRole('link', { name: 'My assets' })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Assets' })).not.toBeInTheDocument();
  });

  it('does not offer a staff filter panel to an Employee', async () => {
    resetMockState({ currentUser: employeeUser, assets: [] });

    renderApp({ route: '/assets' });
    await waitForList();

    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });
});

describe('asset creation route — staff only', () => {
  it('renders the create form for staff', async () => {
    resetMockState({ currentUser: agentUser });

    renderApp({ route: '/assets/new' });

    expect(
      await screen.findByRole('heading', { name: 'New asset' }),
    ).toBeInTheDocument();
  });

  it('falls through to "page not found" for an Employee deep-linking to /assets/new', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/assets/new' });

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('New asset')).not.toBeInTheDocument();
  });
});

describe('asset list — assignee filter (D3 row scoping)', () => {
  it('scopes an Employee to assets currently assigned to them without a filter panel', async () => {
    resetMockState({
      currentUser: employeeUser,
      assets: [
        makeAsset({
          id: IDS.assetA,
          assetTag: 'MINE-0001',
          currentAssignee: {
            id: employeeUser.id,
            firstName: 'Grace',
            lastName: 'Kim',
            role: 'Employee',
          },
          status: 'Assigned',
        }),
        makeAsset({
          id: IDS.assetB,
          assetTag: 'OTHER-0001',
          currentAssignee: null,
        }),
      ],
    });

    renderApp({ route: '/assets' });
    await waitForList();

    expect(
      table().getByRole('link', { name: 'MINE-0001' }),
    ).toBeInTheDocument();
    expect(
      table().queryByRole('link', { name: 'OTHER-0001' }),
    ).not.toBeInTheDocument();
  });
});
