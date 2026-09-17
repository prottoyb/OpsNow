import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssetForm } from './AssetForm';
import type { AssetFormValues } from './AssetForm';

const ASSET_TYPES = [
  { id: '91111111-1111-4111-8111-111111111111', name: 'Laptop', isActive: true },
];

const EMPTY_VALUES: AssetFormValues = {
  assetTag: '',
  name: '',
  assetTypeId: '',
  serialNumber: '',
  purchaseDate: '',
  warrantyExpiresAt: '',
  notes: '',
};

describe('AssetForm — validation', () => {
  it('requires an asset tag, a name and a type in create mode', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <AssetForm
        mode="create"
        initialValues={EMPTY_VALUES}
        assetTypes={ASSET_TYPES}
        submitting={false}
        serverMessages={[]}
        submitLabel="Create asset"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create asset' }));

    expect(screen.getByText('Enter an asset tag.')).toBeInTheDocument();
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Choose an asset type.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not render or require an asset tag field in edit mode', () => {
    render(
      <AssetForm
        mode="edit"
        initialValues={{ ...EMPTY_VALUES, assetTag: 'LAPTOP-0001', name: 'X', assetTypeId: ASSET_TYPES[0].id }}
        assetTypes={ASSET_TYPES}
        submitting={false}
        serverMessages={[]}
        submitLabel="Save changes"
        onSubmit={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/asset tag/i)).not.toBeInTheDocument();
    // Rendered as read-only context split across a <span> and a text node —
    // matched against the whole body rather than a single element's text.
    expect(document.body.textContent).toMatch(/Asset tag:\s*LAPTOP-0001/);
  });

  it('never renders a status field — status is a separate staff-only control (D5)', () => {
    render(
      <AssetForm
        mode="edit"
        initialValues={{ ...EMPTY_VALUES, assetTag: 'LAPTOP-0001', name: 'X', assetTypeId: ASSET_TYPES[0].id }}
        assetTypes={ASSET_TYPES}
        submitting={false}
        serverMessages={[]}
        submitLabel="Save changes"
        onSubmit={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it('submits trimmed values once valid', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <AssetForm
        mode="create"
        initialValues={EMPTY_VALUES}
        assetTypes={ASSET_TYPES}
        submitting={false}
        serverMessages={[]}
        submitLabel="Create asset"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/asset tag/i), '  LAPTOP-0002  ');
    await user.type(screen.getByLabelText(/^name/i), '  ThinkPad  ');
    await user.selectOptions(screen.getByLabelText(/^asset type/i), ASSET_TYPES[0].id);
    await user.click(screen.getByRole('button', { name: 'Create asset' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ assetTag: 'LAPTOP-0002', name: 'ThinkPad' }),
    );
  });

  it('renders server validation messages verbatim', () => {
    render(
      <AssetForm
        mode="create"
        initialValues={EMPTY_VALUES}
        assetTypes={ASSET_TYPES}
        submitting={false}
        serverMessages={['assetTag must be unique']}
        submitLabel="Create asset"
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByText('assetTag must be unique')).toBeInTheDocument();
  });
});
