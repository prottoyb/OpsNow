import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssetAssignmentControl } from './AssetAssignmentControl';

const ME = '11111111-1111-4111-8111-111111111111';
const SOMEONE_ELSE = {
  id: '22222222-2222-4222-8222-222222222222',
  firstName: 'Priya',
  lastName: 'Shah',
  role: 'SupportAgent' as const,
};

describe('AssetAssignmentControl — status × assignee matrix', () => {
  it('offers "Assign to me" when unassigned and InStock', () => {
    render(
      <AssetAssignmentControl
        status="InStock"
        currentAssignee={null}
        currentUserId={ME}
        submitting={false}
        onAssign={() => {}}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Assign to me' }),
    ).toBeInTheDocument();
  });

  it.each(['InRepair', 'Retired', 'Lost'] as const)(
    'disables assignment with a reason when unassigned and %s',
    (status) => {
      render(
        <AssetAssignmentControl
          status={status}
          currentAssignee={null}
          currentUserId={ME}
          submitting={false}
          onAssign={() => {}}
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'Assign to me' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/move it back to stock first/i)).toBeInTheDocument();
    },
  );

  it('offers "Return to stock" and never "Assign to me" when already assigned to someone', () => {
    render(
      <AssetAssignmentControl
        status="Assigned"
        currentAssignee={SOMEONE_ELSE}
        currentUserId={ME}
        submitting={false}
        onAssign={() => {}}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Return to stock' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign to me' }),
    ).not.toBeInTheDocument();
    // The no-op assignment (re-assigning to the same holder) is never
    // offerable through this control at all — there is no "assign to
    // someone else" affordance here (D1), so the only assignee-changing
    // action possible is returning it to stock.
  });

  it('marks the signed-in user\'s own holding as "(you)"', () => {
    render(
      <AssetAssignmentControl
        status="Assigned"
        currentAssignee={{ id: ME, firstName: 'Grace', lastName: 'Kim', role: 'Employee' }}
        currentUserId={ME}
        submitting={false}
        onAssign={() => {}}
      />,
    );

    expect(screen.getByText(/Grace Kim\s*\(you\)/)).toBeInTheDocument();
  });

  it('calls onAssign with assignedToId: null when returning to stock', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(
      <AssetAssignmentControl
        status="Assigned"
        currentAssignee={SOMEONE_ELSE}
        currentUserId={ME}
        submitting={false}
        onAssign={onAssign}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Return to stock' }));

    expect(onAssign).toHaveBeenCalledWith({ assignedToId: null });
  });

  it('calls onAssign with the current user id and trimmed notes when assigning to me', async () => {
    const onAssign = vi.fn();
    const user = userEvent.setup();
    render(
      <AssetAssignmentControl
        status="InStock"
        currentAssignee={null}
        currentUserId={ME}
        submitting={false}
        onAssign={onAssign}
      />,
    );

    await user.type(screen.getByLabelText('Notes'), '  For the new hire  ');
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));

    expect(onAssign).toHaveBeenCalledWith({
      assignedToId: ME,
      notes: 'For the new hire',
    });
  });

  it('renders a server validation message verbatim', () => {
    render(
      <AssetAssignmentControl
        status="InStock"
        currentAssignee={null}
        currentUserId={ME}
        submitting={false}
        serverMessages={['Asset is already unassigned']}
        onAssign={() => {}}
      />,
    );

    expect(screen.getByText('Asset is already unassigned')).toBeInTheDocument();
  });
});
