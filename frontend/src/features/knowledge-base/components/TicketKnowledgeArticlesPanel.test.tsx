import { HttpResponse, http } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  employeeUser,
  makeArticle,
  makeTicketKnowledgeArticle,
  toArticleSummary,
} from '../../../mocks/fixtures';
import { mockState, resetMockState } from '../../../mocks/handlers';
import { renderWithProviders } from '../../../test/renderApp';
import { server } from '../../../mocks/server';
import type {
  AuthenticatedUser,
  TicketKnowledgeArticle,
} from '../../../types/api';
import { ArticleLinkPicker } from './ArticleLinkPicker';
import { TicketKnowledgeArticlesPanel } from './TicketKnowledgeArticlesPanel';

const BASE = '*/api/v1';

function seed(
  who: AuthenticatedUser,
  ticketArticles: TicketKnowledgeArticle[] = [makeTicketKnowledgeArticle()],
) {
  resetMockState({
    currentUser: who,
    ticketArticles,
    articles: ticketArticles.map((link) =>
      makeArticle({
        id: link.article.id,
        title: link.article.title,
        status: link.article.status,
      }),
    ),
  });
}

async function renderPanel() {
  renderWithProviders(<TicketKnowledgeArticlesPanel ticketId={IDS.ticketA} />);
  await screen.findByRole('heading', { name: 'Knowledge articles' });
}

describe('TicketKnowledgeArticlesPanel — Employee', () => {
  it('links each row through to the article but offers no link or unlink action', async () => {
    seed(employeeUser);

    await renderPanel();

    /*
     * Hyperlinked even for an Employee, unlike `TicketAssetsPanel`'s rows:
     * the backend has already scoped these rows to the caller's article
     * visibility, so the target is guaranteed readable and the link can never
     * land on a 404.
     */
    expect(
      await screen.findByRole('link', { name: /how to reset your password/i }),
    ).toHaveAttribute('href', `/kb/${IDS.articleA}`);
    expect(
      screen.queryByRole('button', { name: /unlink/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /link an article/i }),
    ).not.toBeInTheDocument();
    // Only ever Published for this role, so the badge would be a constant.
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
  });

  it('is never shown a draft linked to their own ticket', async () => {
    const draft = makeArticle({
      id: IDS.articleB,
      title: 'Internal escalation notes',
      status: 'Draft',
      publishedAt: null,
    });
    resetMockState({
      currentUser: employeeUser,
      articles: [makeArticle(), draft],
      ticketArticles: [
        makeTicketKnowledgeArticle(),
        makeTicketKnowledgeArticle({ article: toArticleSummary(draft) }),
      ],
    });

    await renderPanel();

    expect(
      await screen.findByRole('link', { name: /how to reset your password/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/internal escalation notes/i),
    ).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing is linked', async () => {
    seed(employeeUser, []);

    await renderPanel();

    expect(
      await screen.findByText(/no knowledge articles are linked to this ticket/i),
    ).toBeInTheDocument();
  });
});

describe('TicketKnowledgeArticlesPanel — staff', () => {
  it('shows the status badge and offers Unlink', async () => {
    seed(agentUser);

    await renderPanel();

    expect(
      await screen.findByRole('link', { name: /how to reset your password/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
  });

  it('unlinks an article', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(mockState.ticketArticles).toHaveLength(0));
    expect(
      await screen.findByText(/no knowledge articles are linked to this ticket/i),
    ).toBeInTheDocument();
  });

  it('links a newly searched article through the picker', async () => {
    resetMockState({
      currentUser: agentUser,
      ticketArticles: [],
      articles: [makeArticle({ id: IDS.articleB, title: 'Wi-Fi onboarding' })],
    });
    const user = userEvent.setup();

    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Link an article' }));
    await user.type(screen.getByLabelText('Search articles'), 'Wi-Fi');
    await user.click(await screen.findByRole('button', { name: 'Link' }));

    await waitFor(() => expect(mockState.ticketArticles).toHaveLength(1));
    expect(
      await screen.findByRole('link', { name: 'Wi-Fi onboarding' }),
    ).toBeInTheDocument();
  });

  it('shows a retryable error when the linked articles cannot be loaded', async () => {
    seed(agentUser);
    server.use(
      http.get(`${BASE}/tickets/:id/knowledge-articles`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED' },
          { status: 500 },
        ),
      ),
    );

    await renderPanel();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load linked articles/i);
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
  });
});

describe('ArticleLinkPicker', () => {
  /**
   * The panel hides an already-linked article from the picker, so this
   * exercises the picker directly with an empty exclusion list — the
   * backend's link route is documented as idempotent, and a re-link must
   * return the existing row rather than adding a second one.
   */
  it('re-linking an already-linked article does not duplicate the row', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    renderWithProviders(
      <ArticleLinkPicker ticketId={IDS.ticketA} excludeArticleIds={[]} />,
    );

    await user.type(screen.getByLabelText('Search articles'), 'password');
    await user.click(await screen.findByRole('button', { name: 'Link' }));

    await waitFor(() => expect(mockState.ticketArticles).toHaveLength(1));
    expect(mockState.ticketArticles[0].article.id).toBe(IDS.articleA);
  });

  it('offers staff a draft to link — writing one up for a ticket is legitimate', async () => {
    resetMockState({
      currentUser: agentUser,
      ticketArticles: [],
      articles: [
        makeArticle({
          id: IDS.articleB,
          title: 'Draft migration runbook',
          status: 'Draft',
          publishedAt: null,
        }),
      ],
    });
    const user = userEvent.setup();

    renderWithProviders(
      <ArticleLinkPicker ticketId={IDS.ticketA} excludeArticleIds={[]} />,
    );

    await user.type(screen.getByLabelText('Search articles'), 'migration');

    expect(await screen.findByText('Draft migration runbook')).toBeInTheDocument();
    // The status is on the row, so nobody links a draft without noticing.
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('says so when a search matches nothing', async () => {
    seed(agentUser, []);
    const user = userEvent.setup();

    renderWithProviders(
      <ArticleLinkPicker ticketId={IDS.ticketA} excludeArticleIds={[]} />,
    );

    expect(
      screen.getByText(/type to search the knowledge base/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search articles'), 'nothing here');

    expect(
      await screen.findByText(/no matching articles/i),
    ).toBeInTheDocument();
  });
});
