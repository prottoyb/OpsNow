import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  IDS,
  agentSummary,
  agentUser,
  employeeUser,
  makeComment,
  makeHistoryEntry,
  makeTicket,
} from '../../../mocks/fixtures';
import { mockState, resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/renderApp';
import type { Ticket } from '../../../types/api';

const BASE = '*/api/v1';
const ROUTE = `/tickets/${IDS.ticketA}`;

const PUBLIC_COMMENT = makeComment({
  id: 'd0000001-1111-4111-8111-111111111111',
  body: 'We are looking into it.',
  visibility: 'Public',
});
const INTERNAL_COMMENT = makeComment({
  id: 'd0000002-1111-4111-8111-111111111111',
  body: 'Hardware is out of warranty, escalate to procurement.',
  visibility: 'Internal',
});

function seed(
  who: typeof employeeUser | typeof agentUser,
  ticket: Partial<Ticket> = {},
) {
  resetMockState({
    currentUser: who,
    tickets: [makeTicket({ id: IDS.ticketA, ...ticket })],
    comments: [PUBLIC_COMMENT, INTERNAL_COMMENT],
    history: [makeHistoryEntry()],
  });
}

async function renderDetail(route = ROUTE) {
  renderApp({ route });
  await screen.findByRole('heading', { name: /#1001/ });
}

describe('ticket detail — Employee', () => {
  it('never renders an internal note', async () => {
    seed(employeeUser);

    await renderDetail();

    expect(
      await screen.findByText('We are looking into it.'),
    ).toBeInTheDocument();
    // The backend excludes internal notes from an Employee's response
    // entirely; the UI must not surface them under any code path.
    expect(
      screen.queryByText(/escalate to procurement/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Internal note')).not.toBeInTheDocument();
  });

  it('offers no visibility control on the comment form', async () => {
    seed(employeeUser);

    await renderDetail();

    expect(await screen.findByLabelText(/add a comment/i)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /visibility/i })).toBeNull();
    expect(screen.queryByLabelText(/internal note/i)).toBeNull();
  });

  it('has no History tab', async () => {
    seed(employeeUser);

    await renderDetail();

    expect(screen.getByRole('tab', { name: 'Comments' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'History' })).toBeNull();
  });

  it('has no priority or assignment control', async () => {
    seed(employeeUser);

    await renderDetail();

    expect(screen.queryByLabelText('Priority')).toBeNull();
    expect(screen.queryByRole('button', { name: /assign to me/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /unassign/i })).toBeNull();
  });

  it('offers only the reopen transition on a Resolved ticket', async () => {
    seed(employeeUser, { status: 'Resolved' });

    await renderDetail();

    expect(
      screen.getByRole('button', { name: 'Reopen ticket' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /move to closed/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /move to in progress/i }),
    ).toBeNull();
  });

  it('offers no transition at all on an Open ticket', async () => {
    seed(employeeUser, { status: 'Open' });

    await renderDetail();

    expect(
      screen.getByText(/you cannot change the status of this ticket/i),
    ).toBeInTheDocument();
  });

  it('can edit details while the ticket is New, but not afterwards', async () => {
    seed(employeeUser, { status: 'New' });
    await renderDetail();
    expect(
      screen.getByRole('button', { name: /edit details/i }),
    ).toBeInTheDocument();
  });

  it('explains why editing is closed once work has started', async () => {
    seed(employeeUser, { status: 'InProgress' });

    await renderDetail();

    expect(screen.queryByRole('button', { name: /edit details/i })).toBeNull();
    expect(
      screen.getByText(/can no longer be edited because work has started/i),
    ).toBeInTheDocument();
  });
});

describe('ticket detail — staff', () => {
  it('renders internal notes with a badge', async () => {
    seed(agentUser);

    await renderDetail();

    expect(
      await screen.findByText(/escalate to procurement/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Internal note')).toBeInTheDocument();
  });

  it('offers the internal visibility option on the comment form', async () => {
    seed(agentUser);

    await renderDetail();

    expect(
      screen.getByRole('radio', { name: /internal note/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /public/i })).toBeChecked();
  });

  it('shows the History tab and its entries', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();

    await user.click(screen.getByRole('tab', { name: 'History' }));

    expect(await screen.findByText(/changed from/i)).toBeInTheDocument();
  });

  it('shows the priority and assignment controls', async () => {
    seed(agentUser);

    await renderDetail();

    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Assign to me' }),
    ).toBeInTheDocument();
  });

  it('gets the full transition matrix from New', async () => {
    seed(agentUser, { status: 'New' });

    await renderDetail();

    for (const label of [
      'Move to Open',
      'Move to In progress',
      'Move to On hold',
      'Move to Resolved',
      'Move to Closed',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});

describe('ticket detail — Closed is terminal for everyone', () => {
  it.each([
    ['Administrator', { ...agentUser, role: 'Administrator' as const }],
    ['SupportAgent', agentUser],
    ['Employee', employeeUser],
  ])('offers no transition out of Closed for %s', async (_label, who) => {
    seed(who, { status: 'Closed' });

    await renderDetail();

    expect(
      screen.getByText(/a closed ticket cannot be reopened/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^move to /i })).toBeNull();
  });
});

describe('ticket detail — mutations', () => {
  it('assigns the ticket to the signed-in agent and then unassigns it', async () => {
    seed(agentUser, { assignee: null });
    const user = userEvent.setup();

    await renderDetail();

    await user.click(screen.getByRole('button', { name: 'Assign to me' }));

    expect(
      await screen.findByText(/ticket assigned to you/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mockState.tickets[0].assignee?.id).toBe(agentUser.id),
    );

    await user.click(await screen.findByRole('button', { name: 'Unassign' }));

    expect(await screen.findByText(/ticket unassigned/i)).toBeInTheDocument();
    await waitFor(() => expect(mockState.tickets[0].assignee).toBeNull());
  });

  it('sends a null assigneeId rather than omitting the key', async () => {
    seed(agentUser, { assignee: agentSummary });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/tickets/:id/assignment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeTicket({ id: IDS.ticketA, assignee: null }));
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Unassign' }));

    await waitFor(() => expect('assigneeId' in body).toBe(true));
    expect(body.assigneeId).toBeNull();
  });

  it('posts an internal note as staff', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();

    await user.type(
      screen.getByLabelText(/add a comment/i),
      'Ordering a replacement.',
    );
    await user.click(screen.getByRole('radio', { name: /internal note/i }));
    await user.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => expect(mockState.comments).toHaveLength(3));
    expect(mockState.comments[2].visibility).toBe('Internal');
  });

  it('sends only the changed fields when editing', async () => {
    seed(agentUser);
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/tickets/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          makeTicket({ id: IDS.ticketA, subject: 'Edited subject' }),
        );
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: /edit details/i }));

    const subject = screen.getByLabelText(/subject/i);
    await user.clear(subject);
    await user.type(subject, 'Edited subject');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(body.subject).toBe('Edited subject'));
    // The description and category were untouched, so they are not resent —
    // `forbidNonWhitelisted` makes a fat body a 400 risk, and an unchanged
    // field would produce a misleading history row.
    expect(Object.keys(body)).toEqual(['subject']);
  });

  it('does not offer to clear a category that is already set', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: /edit details/i }));

    const select = screen.getByLabelText('Category');
    const options = within(select).getAllByRole('option');
    expect(options.some((o) => o.textContent === 'No category')).toBe(false);
    expect(
      screen.getByText(/a category can be changed but not removed/i),
    ).toBeInTheDocument();
  });
});

describe('ticket detail — failure states', () => {
  it('shows a 404 without hinting the ticket might belong to someone else', async () => {
    resetMockState({ currentUser: employeeUser, tickets: [] });

    renderApp({ route: ROUTE });

    expect(
      await screen.findByRole('heading', { name: 'Ticket not found' }),
    ).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    // ADR-019 chose 404-over-403 so an Employee cannot confirm that another
    // person's ticket exists. The copy must not give that back.
    expect(body).not.toMatch(/not yours|someone else|another user|no access/i);
  });

  it('handles a malformed id, which ParseUUIDPipe rejects as 400 not 404', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/tickets/garbage' });

    expect(
      await screen.findByRole('heading', { name: 'Invalid ticket reference' }),
    ).toBeInTheDocument();
  });

  it('explains a 403 and refetches, rather than leaving a stale page', async () => {
    seed(employeeUser, { status: 'Resolved' });
    let ticketReads = 0;
    server.use(
      http.get(`${BASE}/tickets/:id`, () => {
        ticketReads += 1;
        return HttpResponse.json(
          makeTicket({ id: IDS.ticketA, status: 'Resolved' }),
        );
      }),
      http.patch(`${BASE}/tickets/:id/status`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message: 'Only staff can change a ticket to this status',
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    const readsBefore = ticketReads;

    await user.click(screen.getByRole('button', { name: 'Reopen ticket' }));

    expect(
      await screen.findByText('Only staff can change a ticket to this status'),
    ).toBeInTheDocument();
    await waitFor(() => expect(ticketReads).toBeGreaterThan(readsBefore));
  });

  it('closes the edit form when the server refuses the edit', async () => {
    /*
      Regression: the form used to stay open after a 403. The refetch that
      follows can withdraw edit permission (the requester's ticket has left
      New), and a form left open over a ticket the server will no longer
      accept edits to is a dead end — Save just 403s again, indefinitely,
      while the explanation of why editing stopped never gets to render.
    */
    seed(employeeUser, { status: 'New' });
    let ticketStatus: Ticket['status'] = 'New';
    server.use(
      http.get(`${BASE}/tickets/:id`, () =>
        HttpResponse.json(makeTicket({ id: IDS.ticketA, status: ticketStatus })),
      ),
      http.patch(`${BASE}/tickets/:id`, () => {
        // The agent picked it up between the page loading and Save landing.
        ticketStatus = 'InProgress';
        return HttpResponse.json(
          {
            statusCode: 403,
            message: 'This ticket can no longer be edited by its requester',
          },
          { status: 403 },
        );
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));

    const subject = screen.getByLabelText(/subject/i);
    await user.clear(subject);
    await user.type(subject, 'Updated subject');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(
        'This ticket can no longer be edited by its requester',
      ),
    ).toBeInTheDocument();

    // The form is gone and cannot be resubmitted...
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument(),
    );
    // ...and the reason editing is no longer offered is now visible.
    expect(
      await screen.findByText(/can no longer be edited because work has started/i),
    ).toBeInTheDocument();
  });

  it('keeps the comment draft when posting fails', async () => {
    // A comment can be 5,000 characters. Clearing the box on submit rather
    // than on success throws all of it away the moment anything goes wrong.
    seed(agentUser, { status: 'Open' });
    server.use(
      http.post(`${BASE}/tickets/:id/comments`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'boom' },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    const draft = 'A carefully written comment that must not be lost.';
    const box = await screen.findByLabelText(/add a comment/i);
    await user.type(box, draft);
    await user.click(screen.getByRole('button', { name: 'Post comment' }));

    await screen.findByText(/something went wrong/i);
    expect(screen.getByLabelText(/add a comment/i)).toHaveValue(draft);
  });

  it('explains a 409 conflict and reloads the ticket', async () => {
    seed(agentUser, { status: 'New' });
    server.use(
      http.patch(`${BASE}/tickets/:id/status`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'Ticket was modified by another request; reload and retry',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Move to Open' }));

    expect(
      await screen.findByText(/someone else changed this ticket/i),
    ).toBeInTheDocument();
  });

  it('shows a retryable error when the ticket cannot be loaded', async () => {
    resetMockState({ currentUser: employeeUser });
    server.use(
      http.get(`${BASE}/tickets/:id`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    renderApp({ route: ROUTE });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load this ticket/i);
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
  });
});
