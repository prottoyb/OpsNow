import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  employeeUser,
  makeArticle,
  teamLeadUser,
} from '../../../mocks/fixtures';
import { resetMockState } from '../../../mocks/handlers';
import { server } from '../../../mocks/server';
import { renderApp } from '../../../test/renderApp';

const BASE = '*/api/v1';

async function waitForList() {
  await screen.findByRole('heading', { level: 1, name: 'Knowledge base' });
  await waitFor(() =>
    expect(screen.queryByText(/loading articles/i)).not.toBeInTheDocument(),
  );
}

describe('article list — states', () => {
  it('shows a loading state before the first page arrives', async () => {
    resetMockState({ currentUser: agentUser, articles: [makeArticle()] });

    renderApp({ route: '/kb' });

    expect(await screen.findByText(/loading articles/i)).toBeInTheDocument();
    await waitForList();
  });

  it('renders each article with its metadata', async () => {
    resetMockState({
      currentUser: agentUser,
      articles: [
        makeArticle({
          title: 'Connecting to the VPN',
          content: 'Install the client, then sign in with your work account.',
        }),
      ],
    });

    renderApp({ route: '/kb' });
    await waitForList();

    expect(
      screen.getByRole('link', { name: 'Connecting to the VPN' }),
    ).toHaveAttribute('href', `/kb/${IDS.articleA}`);
    // The list projection carries an excerpt, never the full body.
    expect(
      screen.getByText(/install the client, then sign in/i),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Knowledge articles' })).getByText(
        'Passwords',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
  });

  it('renders an error state with a retry action and no server internals', async () => {
    resetMockState({ currentUser: agentUser });
    server.use(
      http.get(`${BASE}/kb-articles`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    renderApp({ route: '/kb' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load articles/i);
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
    expect(
      within(alert).getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('distinguishes "nothing yet" from "no matches"', async () => {
    resetMockState({ currentUser: agentUser, articles: [] });
    const user = userEvent.setup();

    renderApp({ route: '/kb' });
    await waitForList();

    expect(screen.getByText('No articles yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /clear filters/i }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'Archived');

    expect(
      await screen.findByText('No articles match these filters'),
    ).toBeInTheDocument();
    // Offered both in the filter panel and beside the empty-state message.
    expect(
      screen.getAllByRole('button', { name: /clear filters/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe('article list — filtering', () => {
  const articles = [
    makeArticle({
      id: IDS.articleA,
      title: 'Connecting to the VPN',
      content: 'Install the VPN client.',
    }),
    makeArticle({
      id: IDS.articleB,
      title: 'Ordering a replacement keyboard',
      content: 'Raise a hardware request.',
      category: null,
    }),
  ];

  it('narrows the list by the debounced search box', async () => {
    resetMockState({ currentUser: agentUser, articles });
    const user = userEvent.setup();

    renderApp({ route: '/kb' });
    await waitForList();

    expect(
      screen.getByRole('link', { name: 'Ordering a replacement keyboard' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search'), 'VPN');

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Ordering a replacement keyboard' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: 'Connecting to the VPN' }),
    ).toBeInTheDocument();
  });

  it('narrows the list by category', async () => {
    resetMockState({ currentUser: agentUser, articles });
    const user = userEvent.setup();

    renderApp({ route: '/kb' });
    await waitForList();

    await user.selectOptions(
      screen.getByLabelText('Category'),
      IDS.kbCategoryPasswords,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Ordering a replacement keyboard' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: 'Connecting to the VPN' }),
    ).toBeInTheDocument();
  });

  it('narrows the list to the signed-in author with "Written by me"', async () => {
    resetMockState({
      currentUser: teamLeadUser,
      articles: [
        makeArticle({ id: IDS.articleA, title: "Someone else's article" }),
        makeArticle({
          id: IDS.articleB,
          title: 'My own article',
          author: {
            id: teamLeadUser.id,
            firstName: 'Dana',
            lastName: 'Okafor',
            role: 'TeamLead',
          },
        }),
      ],
    });
    const user = userEvent.setup();

    renderApp({ route: '/kb' });
    await waitForList();

    await user.click(screen.getByLabelText('Written by me'));

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: "Someone else's article" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: 'My own article' }),
    ).toBeInTheDocument();
  });
});

describe('article list — role differences', () => {
  it('offers staff the status and author filters plus "New article"', async () => {
    resetMockState({ currentUser: agentUser, articles: [makeArticle()] });

    renderApp({ route: '/kb' });
    await waitForList();

    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Written by me')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'New article' }),
    ).toBeInTheDocument();
    // The status badge is meaningful for staff, who see every status.
    expect(
      within(screen.getByRole('list', { name: 'Knowledge articles' })).getByText(
        'Published',
      ),
    ).toBeInTheDocument();
  });

  it('offers an Employee search and category but no status, author or create affordance', async () => {
    resetMockState({ currentUser: employeeUser, articles: [makeArticle()] });

    renderApp({ route: '/kb' });
    await waitForList();

    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Written by me')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New article' }),
    ).not.toBeInTheDocument();
    // An Employee only ever sees Published articles, so a badge on every row
    // would carry no information.
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
  });

  it('never shows an Employee a draft', async () => {
    resetMockState({
      currentUser: employeeUser,
      articles: [
        makeArticle({ id: IDS.articleA, title: 'Live guidance' }),
        makeArticle({
          id: IDS.articleB,
          title: 'Half-written internal notes',
          status: 'Draft',
          publishedAt: null,
        }),
      ],
    });

    renderApp({ route: '/kb' });
    await waitForList();

    expect(
      screen.getByRole('link', { name: 'Live guidance' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/half-written internal notes/i),
    ).not.toBeInTheDocument();
  });

  it('links every role to the knowledge base from the main nav', async () => {
    resetMockState({ currentUser: employeeUser, articles: [] });

    renderApp({ route: '/kb' });
    await waitForList();

    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(
      nav.getByRole('link', { name: 'Knowledge base' }),
    ).toBeInTheDocument();
  });
});

describe('article list — pagination', () => {
  const manyArticles = Array.from({ length: 25 }, (_, index) =>
    makeArticle({
      id: `6${String(index).padStart(7, '0')}-1111-4111-8111-111111111111`,
      title: `Article ${String(index).padStart(2, '0')}`,
    }),
  );

  it('reports the visible range and moves between pages', async () => {
    resetMockState({ currentUser: agentUser, articles: manyArticles });
    const user = userEvent.setup();

    renderApp({ route: '/kb' });
    await waitForList();

    expect(
      screen.getByText(/showing 1–20 of 25 articles \(page 1 of 2\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByText(/showing 21–25 of 25 articles \(page 2 of 2\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Article 24' }),
    ).toBeInTheDocument();
  });
});

describe('article creation route — staff only', () => {
  it('renders the create form for staff', async () => {
    resetMockState({ currentUser: agentUser });

    renderApp({ route: '/kb/new' });

    expect(
      await screen.findByRole('heading', { name: 'New article' }),
    ).toBeInTheDocument();
  });

  it('falls through to "page not found" for an Employee deep-linking to /kb/new', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/kb/new' });

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'New article' }),
    ).not.toBeInTheDocument();
  });

  it('creates a draft without ever sending a status, slug or author', async () => {
    resetMockState({ currentUser: agentUser, articles: [] });
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/kb-articles`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeArticle({ status: 'Draft' }), {
          status: 201,
        });
      }),
    );
    const user = userEvent.setup();

    renderApp({ route: '/kb/new' });
    await screen.findByRole('heading', { name: 'New article' });

    await user.type(await screen.findByLabelText(/^title/i), 'Printer setup');
    await user.type(screen.getByLabelText(/^body/i), 'Plug it in.');
    await user.click(screen.getByRole('button', { name: 'Create article' }));

    await waitFor(() => expect(body.title).toBe('Printer setup'));
    expect(Object.keys(body).sort()).toEqual(['content', 'title']);
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('slug');
    expect(body).not.toHaveProperty('authorId');
  });
});
