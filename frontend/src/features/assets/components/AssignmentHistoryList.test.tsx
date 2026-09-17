import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssignmentHistoryList } from './AssignmentHistoryList';
import { makeAssignment } from '../../../mocks/fixtures';

describe('AssignmentHistoryList', () => {
  it('shows an empty state when the asset has never been assigned', () => {
    render(<AssignmentHistoryList assignments={[]} />);

    expect(
      screen.getByText('This asset has never been assigned.'),
    ).toBeInTheDocument();
  });

  it('marks the open row (returnedAt === null) as the current holding', () => {
    const open = makeAssignment({
      id: 'open-row',
      returnedAt: null,
    });

    render(<AssignmentHistoryList assignments={[open]} />);

    expect(screen.getByText('Current holding')).toBeInTheDocument();
  });

  it('shows a closed row with its return date and no "current" badge', () => {
    const closed = makeAssignment({
      id: 'closed-row',
      returnedAt: '2026-01-10T09:00:00.000Z',
    });

    render(<AssignmentHistoryList assignments={[closed]} />);

    expect(screen.queryByText('Current holding')).not.toBeInTheDocument();
    expect(screen.getByText(/returned/i)).toBeInTheDocument();
  });

  it('shows the holder, the assigner and notes', () => {
    const assignment = makeAssignment({
      id: 'row-1',
      notes: 'Issued for onboarding.',
    });

    render(<AssignmentHistoryList assignments={[assignment]} />);

    expect(screen.getByText('Grace Kim')).toBeInTheDocument();
    expect(screen.getByText(/Assigned by Priya Shah/)).toBeInTheDocument();
    expect(screen.getByText('Issued for onboarding.')).toBeInTheDocument();
  });

  it('renders every timestamp as a machine-readable <time>', () => {
    const assignment = makeAssignment({
      id: 'row-1',
      returnedAt: '2026-01-10T09:00:00.000Z',
    });

    render(<AssignmentHistoryList assignments={[assignment]} />);

    const times = document.querySelectorAll('time');
    expect(times.length).toBeGreaterThanOrEqual(2);
    for (const time of times) {
      expect(time.getAttribute('dateTime')).toBeTruthy();
    }
  });
});
