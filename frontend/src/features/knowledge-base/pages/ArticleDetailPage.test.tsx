import { HttpResponse, http } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  employeeUser,
  makeArticle,
  makeArticleFeedback,
  otherAgentSummary,
  teamLeadUser,
} from '../../../mocks/fixtures';
import { mockState, resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/renderApp';
import type { AuthenticatedUser, KnowledgeArticle } from '../../../types/api';

const BASE = '*/api/v1';
const ROUTE = `/kb/${IDS.articleA}`;

afterEach(() => {
  server.events.removeAllListeners();
});

function seed(who: AuthenticatedUser, article: Partial<KnowledgeArticle> = {}) {
  resetMockState({
    currentUser: who,
    articles: [makeArticle({ id: IDS.articleA, ...article })],
  });
}

async function renderDetail(title = 'How to reset your password') {
  renderApp({ route: ROUTE });
  await screen.findByRole('heading', { level: 1, name: title });
}

describe('article detail — rendering the body', () => {
  /**
   * The single most important assertion in this feature. An article body is
   * user-authored text that every Employee reads; rendering it through a
   * Markdown or HTML renderer would make any staff author able to plant
   * script that runs in an Administrator's session. It is a React text node
   * and nothing else — see `ArticleBody`.
   */
  it('renders markup in the body as literal text, never as markup', async () => {
    seed(agentUser, {
      content:
        'Paste this into the form:\n<script>alert(1)</script>\n<img src=x onerror=alert(2)>',
    });

    await renderDetail();

    const body = await screen.findByText(/alert\(1\)/);
    expect(body.textContent).toContain('<script>alert(1)</script>');
    expect(body.textContent).toContain('<img src=x onerror=alert(2)>');
    // Nothing was parsed into real elements.
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('preserves the author’s line breaks without parsing them', async () => {
    seed(agentUser, { content: 'Step one\nStep two' });

    await renderDetail();

    const body = await screen.findByText(/step one/i);
    expect(body.textContent).toBe('Step one\nStep two');
    expect(body).toHaveClass('whitespace-pre-wrap');
    // Markdown is shown verbatim, not formatted.
    expect(document.querySelector('strong')).toBeNull();
  });

  it('shows the article metadata', async () => {
    seed(agentUser);

    await renderDetail();

    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getAllByText('Passwords').length).toBeGreaterThan(0);
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});

describe('article detail — feedback', () => {
  it('records a vote and updates the aggregate counts', async () => {
    seed(employeeUser);
    const user = userEvent.setup();

    await renderDetail();

    expect(
      screen.getByText('0 found this helpful, 0 did not.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, this helped' }));

    expect(
      await screen.findByText('1 found this helpful, 0 did not.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockState.articleFeedback).toHaveLength(1));
    expect(mockState.articleFeedback[0].isHelpful).toBe(true);
  });

  it('replaces an existing vote rather than adding a second one', async () => {
    resetMockState({
      currentUser: employeeUser,
      articles: [makeArticle()],
      articleFeedback: [
        makeArticleFeedback({ isHelpful: true, comment: 'Worked for me.' }),
      ],
    });
    const user = userEvent.setup();

    await renderDetail();

    expect(
      screen.getByText('1 found this helpful, 0 did not.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/you said this article was/i)).toHaveTextContent(
      'helpful',
    );

    await user.click(screen.getByRole('button', { name: 'No, it did not' }));

    expect(
      await screen.findByText('0 found this helpful, 1 did not.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockState.articleFeedback).toHaveLength(1));
  });

  it('sends a comment with the vote, and clears it when re-voting with the box emptied', async () => {
    seed(employeeUser);
    const user = userEvent.setup();

    await renderDetail();

    const comment = screen.getByLabelText(/comment for the support team/i);
    await user.type(comment, 'The second step is out of date.');
    await user.click(screen.getByRole('button', { name: 'No, it did not' }));

    await waitFor(() =>
      expect(mockState.articleFeedback[0]?.comment).toBe(
        'The second step is out of date.',
      ),
    );

    await user.clear(screen.getByLabelText(/comment for the support team/i));
    await user.click(screen.getByRole('button', { name: 'Yes, this helped' }));

    await waitFor(() =>
      expect(mockState.articleFeedback[0]?.comment).toBeNull(),
    );
    expect(mockState.articleFeedback).toHaveLength(1);
  });

  it('omits the comment key entirely when the box is empty', async () => {
    seed(employeeUser);
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/kb-articles/:id/feedback`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { helpfulCount: 1, notHelpfulCount: 0, myFeedback: null },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Yes, this helped' }));

    await waitFor(() => expect(body.isHelpful).toBe(true));
    expect(Object.keys(body)).toEqual(['isHelpful']);
  });
});

describe('article detail — Employee', () => {
  it('offers feedback but no edit, publish or reader-feedback affordances', async () => {
    seed(employeeUser);

    await renderDetail();

    expect(
      screen.getByRole('button', { name: 'Yes, this helped' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /edit article/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^publish$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /unpublish|archive/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Reader feedback' }),
    ).not.toBeInTheDocument();
    // The status badge is noise for a role that only ever sees Published.
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('never requests the staff-only feedback log', async () => {
    seed(employeeUser);

    const requested: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requested.push(`${request.method} ${new URL(request.url).pathname}`);
    });

    await renderDetail();
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));

    expect(
      requested.filter((entry) => entry.startsWith('GET') && entry.includes('feedback')),
    ).toEqual([]);
  });

  it('shows a plain "not found" for a draft, with no hint that it exists', async () => {
    seed(employeeUser, { status: 'Draft', publishedAt: null });

    renderApp({ route: ROUTE });

    expect(
      await screen.findByRole('heading', { name: 'Article not found' }),
    ).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(
      /draft|unpublished|no access|not allowed|staff only/i,
    );
  });
});

describe('article detail — SupportAgent authorship', () => {
  it('offers editing on an article the agent wrote', async () => {
    seed(agentUser);

    await renderDetail();

    expect(
      screen.getByRole('button', { name: 'Edit article' }),
    ).toBeInTheDocument();
  });

  it("offers no editing on a colleague's article", async () => {
    seed(agentUser, { author: otherAgentSummary });

    await renderDetail();

    expect(screen.getByText('Marco Rossi')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /edit article/i }),
    ).not.toBeInTheDocument();
  });

  it('offers no publishing controls even on its own article', async () => {
    seed(agentUser, { status: 'Draft', publishedAt: null });

    await renderDetail();

    expect(screen.queryByText('Publishing')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish' }),
    ).not.toBeInTheDocument();
  });

  it('can see the staff-only reader feedback log', async () => {
    resetMockState({
      currentUser: agentUser,
      articles: [makeArticle()],
      articleFeedback: [
        makeArticleFeedback({ comment: 'Clearer than the old runbook.' }),
      ],
    });

    await renderDetail();

    expect(
      screen.getByRole('tab', { name: 'Reader feedback' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Clearer than the old runbook.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Grace Kim')).toBeInTheDocument();
  });

  it('shows an empty reader-feedback log when nobody has rated the article', async () => {
    seed(agentUser);

    await renderDetail();

    expect(
      await screen.findByText(/nobody has rated this article yet/i),
    ).toBeInTheDocument();
  });

  it('shows a retryable error when the reader-feedback log fails', async () => {
    seed(agentUser);
    server.use(
      http.get(`${BASE}/kb-articles/:id/feedback`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    await renderDetail();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load feedback/i);
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
  });
});

describe('article detail — TeamLead publishing', () => {
  it('offers unpublish and archive on a published article', async () => {
    seed(teamLeadUser);

    await renderDetail();

    expect(
      screen.getByRole('button', { name: 'Unpublish' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish' }),
    ).not.toBeInTheDocument();
  });

  it('offers publish and archive on a draft', async () => {
    seed(teamLeadUser, { status: 'Draft', publishedAt: null });

    await renderDetail();

    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('never offers Archived -> Published, only a restore to draft', async () => {
    seed(teamLeadUser, { status: 'Archived' });

    await renderDetail();

    expect(
      screen.getByRole('button', { name: 'Restore to draft' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish' }),
    ).not.toBeInTheDocument();
  });

  it('publishes a draft, sending only the status key', async () => {
    seed(teamLeadUser, { status: 'Draft', publishedAt: null });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/kb-articles/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeArticle({ status: 'Published' }));
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(body.status).toBe('Published'));
    expect(Object.keys(body)).toEqual(['status']);
    expect(
      await screen.findByText(/article is now published/i),
    ).toBeInTheDocument();
  });

  it('may edit an article it did not author', async () => {
    seed(teamLeadUser, { author: otherAgentSummary });

    await renderDetail();

    expect(
      screen.getByRole('button', { name: 'Edit article' }),
    ).toBeInTheDocument();
  });
});

describe('article detail — editing', () => {
  it('sends only the changed fields', async () => {
    seed(agentUser, { title: 'Old title', content: 'Old body' });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/kb-articles/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeArticle({ title: 'New title' }));
      }),
    );
    const user = userEvent.setup();

    await renderDetail('Old title');
    await user.click(screen.getByRole('button', { name: 'Edit article' }));
    const title = screen.getByLabelText(/^title/i);
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(body.title).toBe('New title'));
    expect(Object.keys(body)).toEqual(['title']);
    expect(body).not.toHaveProperty('status');
  });

  /**
   * The one place an article diverges from a ticket: `categoryId: null` is a
   * legal way to move an article out of its category, where the same value on
   * a ticket is a 400.
   */
  it('sends an explicit null to clear the category', async () => {
    seed(agentUser);
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${BASE}/kb-articles/:id`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeArticle({ category: null }));
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit article' }));
    await user.selectOptions(screen.getByLabelText(/^category/i), '');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect('categoryId' in body).toBe(true));
    expect(body.categoryId).toBeNull();
    expect(Object.keys(body)).toEqual(['categoryId']);
  });

  it('sends no request at all when Save is pressed with nothing changed', async () => {
    seed(agentUser);
    let called = false;
    server.use(
      http.patch(`${BASE}/kb-articles/:id`, async ({ request }) => {
        called = true;
        return HttpResponse.json(await request.json());
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit article' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument(),
    );
    expect(called).toBe(false);
  });
});

describe('article detail — failure states', () => {
  it('handles a malformed id, which ParseUUIDPipe rejects as 400 not 404', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/kb/garbage' });

    expect(
      await screen.findByRole('heading', { name: 'Invalid article reference' }),
    ).toBeInTheDocument();
  });

  it('shows a retryable error when the article cannot be loaded', async () => {
    resetMockState({ currentUser: employeeUser });
    server.use(
      http.get(`${BASE}/kb-articles/:id`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    renderApp({ route: ROUTE });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load this article/i);
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
  });

  /**
   * The role checks above decide what is OFFERED. The backend is the gate, so
   * a 403 must still land somewhere sensible — here, because the agent's
   * authorship changed underneath them.
   */
  it('explains a 403 from an edit and closes the edit form', async () => {
    seed(agentUser);
    server.use(
      http.patch(`${BASE}/kb-articles/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message: 'You can only edit knowledge articles you authored',
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit article' }));
    const title = screen.getByLabelText(/^title/i);
    await user.clear(title);
    await user.type(title, 'Retitled');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(
        'You can only edit knowledge articles you authored',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('explains a 403 from a status change a SupportAgent should never have been offered', async () => {
    seed(teamLeadUser, { status: 'Draft', publishedAt: null });
    server.use(
      http.patch(`${BASE}/kb-articles/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 403,
            message:
              'Only a TeamLead or Administrator can publish, unpublish or archive a knowledge article',
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(
      await screen.findByText(/only a teamlead or administrator can publish/i),
    ).toBeInTheDocument();
  });

  it('explains a 409 conflict and reloads the article', async () => {
    seed(agentUser);
    server.use(
      http.patch(`${BASE}/kb-articles/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message:
              'Knowledge article was modified by another request; reload and retry',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit article' }));
    const title = screen.getByLabelText(/^title/i);
    await user.clear(title);
    await user.type(title, 'Retitled');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(/someone else changed this article/i),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows a 400 from the feedback endpoint inline, not as the page notice', async () => {
    seed(employeeUser);
    server.use(
      http.post(`${BASE}/kb-articles/:id/feedback`, () =>
        HttpResponse.json(
          { statusCode: 400, message: 'comment must be shorter than 1000' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();

    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Yes, this helped' }));

    expect(
      await screen.findByText('comment must be shorter than 1000'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/someone else changed this article/i),
    ).not.toBeInTheDocument();
  });
});
