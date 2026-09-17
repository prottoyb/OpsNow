import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IDS, agentUser, makeAsset } from '../../../mocks/fixtures';
import { mockState, resetMockState } from '../../../mocks/handlers';
import { renderWithProviders } from '../../../test/renderApp';
import { AssetLinkPicker } from './AssetLinkPicker';

async function typeQuery(user: UserEvent, text: string) {
  await user.type(screen.getByLabelText('Search assets'), text);
}

describe('AssetLinkPicker', () => {
  it('shows a hint before anything is typed', async () => {
    resetMockState({ currentUser: agentUser });

    renderWithProviders(
      <AssetLinkPicker ticketId={IDS.ticketA} excludeAssetIds={[]} />,
    );

    expect(
      await screen.findByText(/type to search assets/i),
    ).toBeInTheDocument();
  });

  it('lists every match rather than auto-selecting when serial numbers collide', async () => {
    resetMockState({
      currentUser: agentUser,
      assets: [
        makeAsset({ id: IDS.assetA, assetTag: 'LAPTOP-0001', serialNumber: 'DUP-1' }),
        makeAsset({ id: IDS.assetB, assetTag: 'LAPTOP-0002', serialNumber: 'DUP-1' }),
      ],
    });
    const user = userEvent.setup();

    renderWithProviders(
      <AssetLinkPicker ticketId={IDS.ticketA} excludeAssetIds={[]} />,
    );
    await typeQuery(user, 'DUP-1');

    expect(await screen.findByText(/LAPTOP-0001/)).toBeInTheDocument();
    expect(screen.getByText(/LAPTOP-0002/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(2);
  });

  it('filters out assets already linked to the ticket', async () => {
    resetMockState({
      currentUser: agentUser,
      assets: [
        makeAsset({ id: IDS.assetA, assetTag: 'LAPTOP-0001' }),
        makeAsset({ id: IDS.assetB, assetTag: 'LAPTOP-0002' }),
      ],
    });
    const user = userEvent.setup();

    renderWithProviders(
      <AssetLinkPicker ticketId={IDS.ticketA} excludeAssetIds={[IDS.assetA]} />,
    );
    await typeQuery(user, 'LAPTOP');

    expect(await screen.findByText(/LAPTOP-0002/)).toBeInTheDocument();
    expect(screen.queryByText(/LAPTOP-0001/)).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    resetMockState({ currentUser: agentUser, assets: [] });
    const user = userEvent.setup();

    renderWithProviders(
      <AssetLinkPicker ticketId={IDS.ticketA} excludeAssetIds={[]} />,
    );
    await typeQuery(user, 'nothing-matches-this');

    expect(
      await screen.findByText(/no matching assets/i),
    ).toBeInTheDocument();
  });

  it('links the chosen asset and clears the search', async () => {
    resetMockState({
      currentUser: agentUser,
      assets: [makeAsset({ id: IDS.assetA, assetTag: 'LAPTOP-0001' })],
    });
    const user = userEvent.setup();
    let linked = false;

    renderWithProviders(
      <AssetLinkPicker
        ticketId={IDS.ticketA}
        excludeAssetIds={[]}
        onLinked={() => {
          linked = true;
        }}
      />,
    );
    await typeQuery(user, 'LAPTOP');
    await user.click(await screen.findByRole('button', { name: 'Link' }));

    await waitFor(() => expect(mockState.ticketAssets).toHaveLength(1));
    await waitFor(() => expect(linked).toBe(true));
    expect(screen.getByLabelText('Search assets')).toHaveValue('');
  });
});
