import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeComment } from '../../../mocks/fixtures';
import { CommentList } from './CommentList';

const publicComment = makeComment({
  id: 'd0000001-1111-4111-8111-111111111111',
  body: 'Public update for the requester.',
  visibility: 'Public',
});
const internalComment = makeComment({
  id: 'd0000002-1111-4111-8111-111111111111',
  body: 'Internal: escalate to procurement.',
  visibility: 'Internal',
});

describe('CommentList', () => {
  /**
   * The real control is server-side — `TicketsService.findComments()` never
   * returns an internal note to a non-staff caller. This asserts the client
   * would still not render one if a response ever carried it, so "an Employee
   * never sees an internal note" holds on every code path.
   */
  it('renders no internal note when the viewer may not see them', () => {
    render(
      <CommentList
        comments={[publicComment, internalComment]}
        canSeeInternal={false}
      />,
    );

    expect(
      screen.getByText('Public update for the requester.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/escalate to procurement/)).toBeNull();
    expect(screen.queryByText('Internal note')).toBeNull();
  });

  it('renders internal notes with a badge for staff', () => {
    render(
      <CommentList
        comments={[publicComment, internalComment]}
        canSeeInternal
      />,
    );

    expect(screen.getByText(/escalate to procurement/)).toBeInTheDocument();
    expect(screen.getByText('Internal note')).toBeInTheDocument();
  });

  it('renders comment bodies as text, never as markup', () => {
    render(
      <CommentList
        comments={[
          makeComment({ body: '<img src=x onerror="alert(1)"> & <b>bold</b>' }),
        ]}
        canSeeInternal={false}
      />,
    );

    expect(
      screen.getByText('<img src=x onerror="alert(1)"> & <b>bold</b>'),
    ).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it('shows an empty state when there are no comments', () => {
    render(<CommentList comments={[]} canSeeInternal={false} />);

    expect(
      screen.getByText(/no comments on this ticket yet/i),
    ).toBeInTheDocument();
  });

  it('shows the empty state when the only comments are hidden from this viewer', () => {
    render(<CommentList comments={[internalComment]} canSeeInternal={false} />);

    expect(
      screen.getByText(/no comments on this ticket yet/i),
    ).toBeInTheDocument();
  });
});
