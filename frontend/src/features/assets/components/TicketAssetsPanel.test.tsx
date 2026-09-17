import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  employeeSummary,
  employeeUser,
  makeAsset,
  makeTicketAsset,
} from '../../../mocks/fixtures';
import { mockState, resetMockState } from '../../../mocks/handlers';
import { renderWithProviders } from '../../../test/renderApp';
import type { AssetStatus, TicketAsset } from '../../../types/api';
import { TicketAssetsPanel } from './TicketAssetsPanel';

function seed(
  who: typeof employeeUser | typeof agentUser,
  ticketAssets: TicketAsset[] = [makeTicketAsset()],
) {
  resetMockState({
    currentUser: who,
    ticketAssets,
    assets: ticketAssets.map((link) =>
      makeAsset({ id: link.asset.id, status: link.asset.status }),
    ),
  });
}

async function renderPanel() {
  renderWithProviders(
    <TicketAssetsPanel ticketId={IDS.ticketA} requester={employeeSummary} />,
  );
  await screen.findByRole('heading', { name: 'Assets' });
}

describe('TicketAssetsPanel — Employee (D4)', () => {
  it('renders linked assets as plain text with no link, unlink or link affordance', async () => {
    seed(employeeUser);

    await renderPanel();

    expect(await screen.findByText(/LAPTOP-0001/)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /LAPTOP-0001/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlink/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /link an asset/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /assign to requester/i }),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing is linked', async () => {
    seed(employeeUser, []);

    await renderPanel();

    expect(
      await screen.findByText(/no assets are linked to this ticket/i),
    ).toBeInTheDocument();
  });
});

describe('TicketAssetsPanel — staff', () => {
  it('links each row to the asset detail page and offers Unlink', async () => {
    seed(agentUser);

    await renderPanel();

    expect(
      await screen.findByRole('link', { name: /LAPTOP-0001/ }),
    ).toHaveAttribute('href', `/assets/${IDS.assetA}`);
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
  });

  it('unlinks an asset', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(mockState.ticketAssets).toHaveLength(0));
    expect(
      await screen.findByText(/no assets are linked to this ticket/i),
    ).toBeInTheDocument();
  });

  it('offers "Assign to requester" only while the asset is InStock', async () => {
    const base = makeTicketAsset();
    function withStatus(status: AssetStatus): TicketAsset {
      return { ...base, asset: { ...base.asset, status } };
    }

    seed(agentUser, [withStatus('Assigned')]);
    await renderPanel();
    await screen.findByText(/LAPTOP-0001/);
    expect(
      screen.queryByRole('button', { name: /assign to requester/i }),
    ).not.toBeInTheDocument();
  });

  it('offers "Assign to requester" while the asset is InStock, and assigns it', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderPanel();
    await user.click(
      await screen.findByRole('button', { name: 'Assign to requester' }),
    );

    await waitFor(() =>
      expect(
        mockState.assets.find((a) => a.id === IDS.assetA)?.currentAssignee
          ?.id,
      ).toBe(employeeSummary.id),
    );
  });

  it('links a newly searched asset through the picker', async () => {
    resetMockState({
      currentUser: agentUser,
      ticketAssets: [],
      assets: [makeAsset({ id: IDS.assetB, assetTag: 'MONITOR-0002' })],
    });
    const user = userEvent.setup();

    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Link an asset' }));
    await user.type(screen.getByLabelText('Search assets'), 'MONITOR');
    await user.click(await screen.findByRole('button', { name: 'Link' }));

    await waitFor(() => expect(mockState.ticketAssets).toHaveLength(1));
  });
});
