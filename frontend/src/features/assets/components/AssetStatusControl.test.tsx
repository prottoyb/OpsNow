import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssetStatusControl } from './AssetStatusControl';

describe('AssetStatusControl', () => {
  it('never offers Assigned — it is only ever granted through the assignment endpoint (D5)', () => {
    render(
      <AssetStatusControl
        status="InStock"
        hasAssignee={false}
        submitting={false}
        onChange={() => {}}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /move to assigned/i }),
    ).not.toBeInTheDocument();
  });

  it('offers every non-assignment status other than the current one', () => {
    render(
      <AssetStatusControl
        status="InStock"
        hasAssignee={false}
        submitting={false}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Move to In repair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Retired' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Lost' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Move to In stock' }),
    ).not.toBeInTheDocument();
  });

  it('disables every transition with a reason while the asset is assigned', () => {
    render(
      <AssetStatusControl
        status="Assigned"
        hasAssignee
        submitting={false}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByText(/return it to stock before changing its status/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onChange with the chosen status', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AssetStatusControl
        status="InStock"
        hasAssignee={false}
        submitting={false}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Move to Retired' }));

    expect(onChange).toHaveBeenCalledWith('Retired');
  });

  it('renders a server validation message verbatim', () => {
    render(
      <AssetStatusControl
        status="InStock"
        hasAssignee={false}
        submitting={false}
        serverMessages={['Asset is currently assigned; return it to stock first']}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByText('Asset is currently assigned; return it to stock first'),
    ).toBeInTheDocument();
  });
});
