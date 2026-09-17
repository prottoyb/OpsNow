import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssetTypeSelect } from './AssetTypeSelect';

const ASSET_TYPES = [
  { id: '91111111-1111-4111-8111-111111111111', name: 'Laptop', isActive: true },
  { id: '92222222-2222-4222-8222-222222222222', name: 'Monitor', isActive: true },
];

describe('AssetTypeSelect', () => {
  it('handles a bare array (GET /asset-types is not a {data,total} envelope)', () => {
    render(
      <AssetTypeSelect
        id="asset-type"
        value=""
        assetTypes={ASSET_TYPES}
        noneLabel="Any type"
        onChange={() => {}}
      />,
    );

    const select = screen.getByRole('combobox');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Any type',
      'Laptop',
      'Monitor',
    ]);
  });

  it('omits the "none" option when required (no noneLabel)', () => {
    render(
      <AssetTypeSelect
        id="asset-type"
        value=""
        assetTypes={ASSET_TYPES}
        onChange={() => {}}
      />,
    );

    const select = screen.getByRole('combobox');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(2);
  });

  it('offers no create/rename/retire affordance — read-only consumer only', () => {
    render(
      <AssetTypeSelect
        id="asset-type"
        value=""
        assetTypes={ASSET_TYPES}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reports the chosen type id', async () => {
    const onChange = vi.fn();
    render(
      <AssetTypeSelect
        id="asset-type"
        value=""
        assetTypes={ASSET_TYPES}
        noneLabel="Any type"
        onChange={onChange}
      />,
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    select.value = ASSET_TYPES[1].id;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith(ASSET_TYPES[1].id);
  });
});
