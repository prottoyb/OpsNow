import { HttpResponse, delay, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IDS,
  agentUser,
  aiStatusDisabled,
  employeeUser,
  makeAiDraft,
  makeAiResolutionSummary,
  makeAiTriage,
  makeTicket,
} from '../../mocks/fixtures';
import { mockState, resetMockState } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/renderApp';
import { AI_FAILURE_REASONS } from '../../types/api';
import type { MockState } from '../../mocks/handlers';

const ROUTE = `/tickets/${IDS.ticketA}`;

/**
 * Every request the app actually sent, recorded straight off MSW's event bus.
 *
 * The negative assertions in this file are the important ones — "the assistant
 * never runs by itself", "an Employee asks for nothing", "nothing retries" —
 * and none of them can be made by looking at the rendered output.
 */
let sentRequests: string[] = [];

function requestsMatching(pattern: RegExp): string[] {
  return sentRequests.filter((entry) => pattern.test(entry));
}

function recordRequest({ request }: { request: Request }) {
  sentRequests.push(`${request.method} ${new URL(request.url).pathname}`);
}

beforeEach(() => {
  sentRequests = [];
  server.events.on('request:start', recordRequest);
});

afterEach(() => {
  server.events.removeListener('request:start', recordRequest);
});

function seed(
  who: typeof employeeUser | typeof agentUser,
  overrides: Partial<MockState> = {},
) {
  resetMockState({
    currentUser: who,
    tickets: [makeTicket({ id: IDS.ticketA })],
    ...overrides,
  });
}

async function renderDetail() {
  renderApp({ route: ROUTE });
  await screen.findByRole('heading', { name: /#1001/ });
}

/** The assistant's own card, so a query cannot stray into the page's existing
 * Triage sidebar (which also says "Priority"). */
async function assistant() {
  const heading = await screen.findByRole('heading', { name: 'AI assistant' });
  // The panel is a <section> identified by its heading; scoping to it keeps a
  // query from straying into the page's existing sidebar.
  const card = heading.closest('section');
  if (!card) throw new Error('AI assistant card not found');
  return within(card as HTMLElement);
}

describe('AI assistant — who sees it', () => {
  it('is not offered to an Employee, and costs them no request', async () => {
    seed(employeeUser);

    await renderDetail();
    // Let anything the page fires on mount settle before asserting absence.
    await screen.findByLabelText(/add a comment/i);

    expect(screen.queryByRole('heading', { name: 'AI assistant' })).toBeNull();
    expect(requestsMatching(/\/ai\//)).toEqual([]);
    expect(mockState.aiRequests).toEqual([]);
  });

  it('tells staff plainly when no provider is configured, and offers nothing', async () => {
    seed(agentUser, { aiStatus: { ...aiStatusDisabled } });

    await renderDetail();
    const panel = await assistant();

    expect(
      await panel.findByText(/not available on this server/i),
    ).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: /suggest triage/i })).toBeNull();
    expect(panel.queryByRole('button', { name: /draft a response/i })).toBeNull();
    expect(
      panel.queryByRole('button', { name: /summarise resolution/i }),
    ).toBeNull();
  });

  it('fails closed when the status request itself fails', async () => {
    seed(agentUser);
    // A broken status endpoint must not leave buttons on screen that could
    // only ever fail.
    server.use(
      http.get('*/api/v1/ai/status', () =>
        HttpResponse.json({ statusCode: 500, message: 'boom' }, { status: 500 }),
      ),
    );

    await renderDetail();
    const panel = await assistant();

    expect(
      await panel.findByText(/not available on this server/i),
    ).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: /suggest triage/i })).toBeNull();
  });
});

describe('AI assistant — nothing runs without a click', () => {
  it('asks only for status on mount', async () => {
    seed(agentUser);

    await renderDetail();
    await screen.findByRole('button', { name: /suggest triage/i });

    expect(mockState.aiRequests.map((r) => r.route)).toEqual(['status']);
    expect(requestsMatching(/\/ai\/triage|draft-response|resolution-summary/)).toEqual(
      [],
    );
  });
});

describe('AI assistant — triage', () => {
  it('renders the suggestion, labelled, without touching the ticket', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));

    expect(await panel.findByText('Software')).toBeInTheDocument();
    expect(panel.getByText('High')).toBeInTheDocument();
    expect(panel.getByText(/failed display driver/i)).toBeInTheDocument();
    expect(
      panel.getByRole('link', { name: 'How to reset your password' }),
    ).toHaveAttribute('href', `/kb/${IDS.articleA}`);

    // The labelling is a safety requirement (ADR-023 Decision 7), not decoration.
    expect(panel.getByText(/generated by ai/i)).toBeInTheDocument();

    // Advisory by construction: a suggestion that has not been applied must
    // leave the ticket byte-identical.
    expect(requestsMatching(/^PATCH/)).toEqual([]);
    expect(mockState.tickets[0].priority).toBe('Medium');
    expect(mockState.tickets[0].category?.id).toBe(IDS.categoryHardware);
  });

  it('applies a suggested priority only on an explicit second click', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));
    await panel.findByText('High');
    expect(requestsMatching(/^PATCH/)).toEqual([]);

    await user.click(panel.getByRole('button', { name: /apply priority/i }));

    await waitFor(() =>
      expect(requestsMatching(/^PATCH .*\/priority$/)).toHaveLength(1),
    );
    expect(mockState.tickets[0].priority).toBe('High');
    expect(
      await screen.findByText('Suggested priority applied.'),
    ).toBeInTheDocument();
  });

  it('applies a suggested category through the ordinary ticket update', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));
    await panel.findByText('Software');

    await user.click(panel.getByRole('button', { name: /apply category/i }));

    await waitFor(() =>
      expect(mockState.tickets[0].category?.id).toBe(IDS.categorySoftware),
    );
    expect(
      await screen.findByText('Suggested category applied.'),
    ).toBeInTheDocument();
  });

  it('offers no Apply for a suggestion the ticket already matches', async () => {
    seed(agentUser, {
      aiTriage: makeAiTriage({
        suggestedPriority: 'Medium',
        suggestedCategory: { id: IDS.categoryHardware, name: 'Hardware' },
      }),
    });
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));

    expect(await panel.findAllByText(/already set/i)).toHaveLength(2);
    expect(panel.queryByRole('button', { name: /apply priority/i })).toBeNull();
    expect(panel.queryByRole('button', { name: /apply category/i })).toBeNull();
  });

  it('handles a 200 in which every field was dropped', async () => {
    // Each triage field is grounded independently and can degrade to null, so
    // an entirely empty result is a real outcome rather than a failure.
    seed(agentUser, {
      aiTriage: makeAiTriage({
        suggestedCategory: null,
        suggestedPriority: null,
        rationale: null,
        relatedArticles: [],
      }),
    });
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));

    expect(await panel.findByText(/no usable suggestion/i)).toBeInTheDocument();
  });
});

describe('AI assistant — draft response and resolution summary', () => {
  it('renders a draft read-only and posts nothing', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /draft a response/i }));

    const draft = await panel.findByLabelText(/draft reply to the requester/i);
    expect(draft).toHaveValue(makeAiDraft().draft);
    expect(draft).toHaveAttribute('readonly');
    expect(panel.getByText(/not sent and not posted/i)).toBeInTheDocument();

    // A draft is written to be sent to a requester; it must never reach them
    // without a person putting it there.
    expect(requestsMatching(/POST .*\/comments$/)).toEqual([]);
  });

  it('renders a resolution summary, labelled', async () => {
    seed(agentUser);
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(
      await panel.findByRole('button', { name: /summarise resolution/i }),
    );

    expect(
      await panel.findByText(makeAiResolutionSummary().summary),
    ).toBeInTheDocument();
    expect(panel.getByText(/generated by ai/i)).toBeInTheDocument();
  });
});

describe('AI assistant — failure handling', () => {
  it.each(AI_FAILURE_REASONS)('explains a 503 with reason %s', async (reason) => {
    seed(agentUser, { aiFailure: { reason } });
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));

    expect(
      await panel.findByText(/suggested triage unavailable/i),
    ).toBeInTheDocument();
    // No result is rendered alongside the failure.
    expect(panel.queryByText('Software')).toBeNull();
    // Exactly one attempt: nothing anywhere retries an AI call.
    await waitFor(() =>
      expect(requestsMatching(/POST .*\/ai\/triage$/)).toHaveLength(1),
    );
  });

  it('shows the reason-specific wording, not a generic 5xx message', async () => {
    seed(agentUser, { aiFailure: { reason: 'rate_limited' } });
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));

    expect(await panel.findByText(/rate limited right now/i)).toBeInTheDocument();
    expect(panel.queryByText(/something went wrong/i)).toBeNull();
  });

  it('degrades safely when the server sends a reason we do not know', async () => {
    seed(agentUser, { aiFailure: { reason: 'quantum_flux' } });
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /draft a response/i }));

    expect(
      await panel.findByText(/ai assistant is unavailable right now/i),
    ).toBeInTheDocument();
    // The unvalidated string from the server is never echoed to the user.
    expect(panel.queryByText(/quantum_flux/i)).toBeNull();
  });

  it('leaves the buttons usable so the person can retry themselves', async () => {
    seed(agentUser, { aiFailure: { reason: 'timeout' } });
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    const button = await panel.findByRole('button', { name: /suggest triage/i });
    await user.click(button);
    await panel.findByText(/took too long/i);

    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() =>
      expect(requestsMatching(/POST .*\/ai\/triage$/)).toHaveLength(2),
    );
  });
});

describe('AI assistant — one call at a time', () => {
  it('disables every action while a call is in flight', async () => {
    seed(agentUser);
    server.use(
      http.post('*/api/v1/tickets/:id/ai/triage', async () => {
        await delay(50);
        return HttpResponse.json(makeAiTriage());
      }),
    );
    const user = userEvent.setup();

    await renderDetail();
    const panel = await assistant();
    await user.click(await panel.findByRole('button', { name: /suggest triage/i }));

    /*
     * All three, not just the one clicked. The backend caps concurrent AI work
     * and answers `busy` beyond it, so letting one person fire three at once
     * would mostly serve them their own rate limit.
     */
    await waitFor(() =>
      expect(panel.getByRole('button', { name: /suggest triage/i })).toBeDisabled(),
    );
    expect(panel.getByRole('button', { name: /draft a response/i })).toBeDisabled();
    expect(
      panel.getByRole('button', { name: /summarise resolution/i }),
    ).toBeDisabled();

    await panel.findByText('Software');
    expect(panel.getByRole('button', { name: /draft a response/i })).toBeEnabled();
  });
});

describe('AI assistant — demonstration mode', () => {
  it('says plainly that mock output is not a model analysis', async () => {
    seed(agentUser, { aiStatus: { enabled: true, mode: 'mock' } });

    await renderDetail();
    const panel = await assistant();

    // Exact, because the notice below repeats the phrase in a sentence.
    expect(await panel.findByText('Demonstration mode')).toBeInTheDocument();
    expect(panel.getByText(/canned sample output/i)).toBeInTheDocument();
  });
});
