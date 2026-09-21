import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { KnowledgeArticleStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { AiAssistantService, buildSearchQuery } from './ai-assistant.service';
import { ConcurrencyLimiter } from './ai.concurrency';
import { AiUnavailableException } from './ai.errors';
import { AiGenerateResult, AiMode, AiPrompt, AiProvider, AiProviderError } from './ai.types';

const CAT = '11111111-1111-4111-8111-111111111111';
const ART = '22222222-2222-4222-8222-222222222222';
const TICKET_ID = '33333333-3333-4333-8333-333333333333';

// Sentinels that must never reach a log line.
const PROMPT_SENTINEL = 'SENTINEL-TICKET-TEXT-9f3';
const COMPLETION_SENTINEL = 'SENTINEL-COMPLETION-TEXT-7a1';
const KEY_SENTINEL = 'sk-SENTINEL-KEY-42';

const agent: AuthenticatedUser = { id: 'agent-id', email: 'a@x.test', role: Role.SupportAgent };
const teamLead: AuthenticatedUser = { id: 'lead-id', email: 'l@x.test', role: Role.TeamLead };
const employee: AuthenticatedUser = { id: 'emp-id', email: 'e@x.test', role: Role.Employee };

class FakeProvider implements AiProvider {
  prompts: AiPrompt[] = [];
  constructor(
    readonly mode: AiMode,
    private readonly respond: (prompt: AiPrompt) => Promise<AiGenerateResult>,
  ) {}
  generate(prompt: AiPrompt): Promise<AiGenerateResult> {
    this.prompts.push(prompt);
    return this.respond(prompt);
  }
}

function answering(payload: unknown, mode: AiMode = 'mock'): FakeProvider {
  return new FakeProvider(mode, () =>
    Promise.resolve({ text: JSON.stringify(payload), model: 'fake-model', inputTokens: 1, outputTokens: 2 }),
  );
}

function setup(provider: AiProvider, limiter = new ConcurrencyLimiter(5)) {
  const prisma = {
    ticket: {
      findFirst: jest.fn().mockResolvedValue({
        id: TICKET_ID,
        subject: `VPN drops ${PROMPT_SENTINEL}`,
        description: `Details ${PROMPT_SENTINEL}`,
        priority: 'Medium',
        status: 'Open',
      }),
    },
    ticketCategory: { findMany: jest.fn().mockResolvedValue([{ id: CAT, name: 'Network' }]) },
    ticketComment: { findMany: jest.fn().mockResolvedValue([{ body: 'a public note' }]) },
    knowledgeBaseArticle: {
      findMany: jest.fn().mockResolvedValue([{ id: ART, title: 'DB Title', slug: 'db-title' }]),
    },
  };
  const knowledgeBase = {
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [{ id: ART, title: 'Model Visible', excerpt: 'ex' }], total: 1 }),
  };
  const service = new AiAssistantService(
    prisma as never,
    knowledgeBase as never,
    provider,
    limiter,
  );
  return { service, prisma, knowledgeBase };
}

async function unavailableReason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiUnavailableException);
    const body = (error as AiUnavailableException).getResponse() as Record<string, unknown>;
    expect(body.code).toBe('AI_UNAVAILABLE');
    expect((error as AiUnavailableException).getStatus()).toBe(503);
    return body.reason as string;
  }
  throw new Error('expected AiUnavailableException');
}

describe('AiAssistantService', () => {
  describe('status', () => {
    it('reports the mode to staff and folds the role check in for everyone else', () => {
      const live = setup(answering({}, 'anthropic')).service;
      expect(live.status(agent)).toEqual({ enabled: true, mode: 'anthropic' });
      expect(live.status(employee)).toEqual({ enabled: false, mode: 'disabled' });

      const off = setup(new FakeProvider('disabled', () => Promise.reject(new Error('x')))).service;
      expect(off.status(agent)).toEqual({ enabled: false, mode: 'disabled' });
    });
  });

  describe('access', () => {
    it('refuses an Employee with 403 before touching the database', async () => {
      const { service, prisma } = setup(answering({}));
      await expect(service.triage(TICKET_ID, employee)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    });

    it('is a 404 when the ticket is not visible, and loads it under the visibility rule', async () => {
      const { service, prisma } = setup(answering({}));
      prisma.ticket.findFirst.mockResolvedValue(null);
      await expect(service.draftResponse(TICKET_ID, agent)).rejects.toBeInstanceOf(NotFoundException);
      const where = prisma.ticket.findFirst.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain('"deletedAt":null');
      expect(JSON.stringify(where)).toContain(TICKET_ID);
    });

    it('is 503 disabled, with no context assembly and no provider call', async () => {
      const provider = new FakeProvider('disabled', () => Promise.reject(new AiProviderError('disabled')));
      const { service, prisma, knowledgeBase } = setup(provider);
      for (const call of [
        () => service.triage(TICKET_ID, agent),
        () => service.draftResponse(TICKET_ID, agent),
        () => service.resolutionSummary(TICKET_ID, agent),
      ]) {
        expect(await unavailableReason(call())).toBe('disabled');
      }
      expect(provider.prompts).toHaveLength(0);
      expect(prisma.ticketCategory.findMany).not.toHaveBeenCalled();
      expect(knowledgeBase.findAll).not.toHaveBeenCalled();
    });
  });

  describe('triage', () => {
    it('grounds the answer and takes names from the database, not the model', async () => {
      const provider = answering({
        categoryId: CAT,
        priority: 'High',
        rationale: 'looks like network',
        articleIds: [ART, '99999999-9999-4999-8999-999999999999'],
      });
      const { service, knowledgeBase } = setup(provider);

      const out = await service.triage(TICKET_ID, agent);

      expect(out).toEqual({
        suggestedCategory: { id: CAT, name: 'Network' },
        suggestedPriority: 'High',
        rationale: 'looks like network',
        relatedArticles: [{ id: ART, title: 'DB Title', slug: 'db-title' }],
        mode: 'mock',
      });
      // Triage candidates go through the caller's visibility, narrowed to Published.
      const query = knowledgeBase.findAll.mock.calls[0][0];
      expect(query.status).toBe(KnowledgeArticleStatus.Published);
      expect(knowledgeBase.findAll.mock.calls[0][1]).toBe(agent);
    });

    it('re-reads recommended articles as Published only', async () => {
      const { service, prisma } = setup(answering({ categoryId: CAT, priority: 'Low', articleIds: [ART] }));
      await service.triage(TICKET_ID, agent);
      expect(JSON.stringify(prisma.knowledgeBaseArticle.findMany.mock.calls[0][0].where)).toContain(
        'Published',
      );
    });

    it('degrades a hallucinated category to null and keeps the valid priority', async () => {
      const { service } = setup(
        answering({ categoryId: '99999999-9999-4999-8999-999999999999', priority: 'Low', articleIds: [] }),
      );
      const out = await service.triage(TICKET_ID, agent);
      expect(out.suggestedCategory).toBeNull();
      expect(out.suggestedPriority).toBe('Low');
    });

    it('re-reads recommended articles under the visibility rule and drops any that vanished', async () => {
      const { service, prisma } = setup(answering({ categoryId: CAT, priority: 'Low', articleIds: [ART] }));
      prisma.knowledgeBaseArticle.findMany.mockResolvedValue([]);
      const out = await service.triage(TICKET_ID, agent);
      expect(out.relatedArticles).toEqual([]);
      const where = JSON.stringify(prisma.knowledgeBaseArticle.findMany.mock.calls[0][0].where);
      expect(where).toContain('"deletedAt":null');
    });

    it('offers only active categories and only the ticket text to the model', async () => {
      const provider = answering({ categoryId: CAT, priority: 'Low', articleIds: [] });
      const { service, prisma } = setup(provider);
      await service.triage(TICKET_ID, teamLead);
      expect(prisma.ticketCategory.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
      expect(provider.prompts[0].user).toContain(PROMPT_SENTINEL);
      expect(provider.prompts[0].user).toContain(`CATEGORY ${CAT} Network`);
      expect(prisma.ticketComment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('draft response', () => {
    it('restricts KB context to Published articles even for a staff caller', async () => {
      const provider = answering({ draft: 'Hi there', articleIds: [ART] });
      const { service, knowledgeBase, prisma } = setup(provider);

      const out = await service.draftResponse(TICKET_ID, teamLead);

      expect(out.draft).toBe('Hi there');
      expect(knowledgeBase.findAll.mock.calls[0][0].status).toBe(KnowledgeArticleStatus.Published);
      const reread = JSON.stringify(prisma.knowledgeBaseArticle.findMany.mock.calls[0][0].where);
      expect(reread).toContain('Published');
    });

    it('reads only public, non-deleted comment bodies — no authors, no internal notes', async () => {
      const { service, prisma } = setup(answering({ draft: 'ok', articleIds: [] }));
      await service.draftResponse(TICKET_ID, agent);
      const args = prisma.ticketComment.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ visibility: 'Public', deletedAt: null });
      expect(args.select).toEqual({ body: true });
    });

    it('treats an unusable draft as invalid_output', async () => {
      const { service } = setup(answering({ draft: '' }));
      expect(await unavailableReason(service.draftResponse(TICKET_ID, agent))).toBe('invalid_output');
    });
  });

  describe('resolution summary', () => {
    it('returns the validated summary', async () => {
      const { service } = setup(answering({ summary: 'Reset the profile.' }));
      expect(await service.resolutionSummary(TICKET_ID, agent)).toEqual({
        summary: 'Reset the profile.',
        mode: 'mock',
      });
    });
  });

  describe('draft articles never reach the vendor (ADR-023 Decision 7)', () => {
    const DRAFT_SENTINEL = 'SENTINEL-DRAFT-ARTICLE-5c2';

    /** A KB whose findAll honours the status filter, like the real one. */
    function withDraftArticle(provider: FakeProvider) {
      const ctx = setup(provider);
      ctx.knowledgeBase.findAll.mockImplementation((query: { status?: KnowledgeArticleStatus }) => {
        const all = [
          { id: ART, title: 'Published Title', excerpt: 'ex', status: KnowledgeArticleStatus.Published },
          { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: DRAFT_SENTINEL, excerpt: DRAFT_SENTINEL, status: KnowledgeArticleStatus.Draft },
        ];
        const data = all.filter((a) => query.status === undefined || a.status === query.status);
        return Promise.resolve({ data, total: data.length });
      });
      return ctx;
    }

    it.each([
      ['triage', (s: AiAssistantService) => s.triage(TICKET_ID, teamLead), { categoryId: CAT, priority: 'Low', articleIds: [] }],
      ['draft response', (s: AiAssistantService) => s.draftResponse(TICKET_ID, teamLead), { draft: 'ok', articleIds: [] }],
      ['resolution summary', (s: AiAssistantService) => s.resolutionSummary(TICKET_ID, teamLead), { summary: 'ok' }],
    ])('keeps a Draft article out of the %s prompt', async (_name, run, payload) => {
      const provider = answering(payload);
      const { service } = withDraftArticle(provider);
      await run(service);
      expect(provider.prompts).toHaveLength(1);
      expect(JSON.stringify(provider.prompts[0])).not.toContain(DRAFT_SENTINEL);
    });

    it('does send the Published article, so the sentinel test is not vacuous', async () => {
      const provider = answering({ categoryId: CAT, priority: 'Low', articleIds: [] });
      const { service } = withDraftArticle(provider);
      await service.triage(TICKET_ID, teamLead);
      expect(provider.prompts[0].user).toContain('Published Title');
    });
  });

  describe('failure mapping', () => {
    it.each(['timeout', 'rate_limited', 'provider_error'] as const)(
      'passes the provider reason %s through',
      async (reason) => {
        const provider = new FakeProvider('anthropic', () => Promise.reject(new AiProviderError(reason)));
        const { service } = setup(provider);
        expect(await unavailableReason(service.triage(TICKET_ID, agent))).toBe(reason);
      },
    );

    it('maps unparseable output to invalid_output', async () => {
      const provider = new FakeProvider('anthropic', () =>
        Promise.resolve({ text: 'I am not JSON', model: 'm' }),
      );
      const { service } = setup(provider);
      expect(await unavailableReason(service.triage(TICKET_ID, agent))).toBe('invalid_output');
    });

    it('maps an unexpected exception to provider_error and does not retry', async () => {
      const provider = new FakeProvider('anthropic', () => Promise.reject(new TypeError('boom')));
      const { service } = setup(provider);
      expect(await unavailableReason(service.triage(TICKET_ID, agent))).toBe('provider_error');
      expect(provider.prompts).toHaveLength(1);
    });

    it('is busy when the in-flight cap is reached', async () => {
      const provider = answering({ summary: 'x' });
      const { service } = setup(provider, new ConcurrencyLimiter(0));
      expect(await unavailableReason(service.resolutionSummary(TICKET_ID, agent))).toBe('busy');
      expect(provider.prompts).toHaveLength(0);
    });
  });

  describe('logging', () => {
    const spies: jest.SpyInstance[] = [];

    beforeEach(() => {
      for (const method of ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const) {
        spies.push(jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined));
      }
    });

    afterEach(() => {
      spies.splice(0).forEach((spy) => spy.mockRestore());
    });

    function loggedText(): string {
      return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    }

    it('logs the class of an unexpected exception but never its message', async () => {
      const { service } = setup(
        new FakeProvider('anthropic', () => Promise.reject(new TypeError(`bug ${PROMPT_SENTINEL}`))),
      );
      await unavailableReason(service.triage(TICKET_ID, agent));
      const text = loggedText();
      expect(text).toContain('unexpectedError=TypeError');
      expect(text).not.toContain(PROMPT_SENTINEL);
    });

    it('never logs a prompt, a completion or a key, on success or failure', async () => {
      const ok = setup(
        new FakeProvider('anthropic', () =>
          Promise.resolve({
            text: JSON.stringify({ summary: `${COMPLETION_SENTINEL} ${KEY_SENTINEL}` }),
            model: 'fake-model',
          }),
        ),
      );
      await ok.service.resolutionSummary(TICKET_ID, agent);

      const failing = setup(
        new FakeProvider('anthropic', () =>
          Promise.reject(new Error(`vendor echoed ${PROMPT_SENTINEL} ${KEY_SENTINEL}`)),
        ),
      );
      await unavailableReason(failing.service.triage(TICKET_ID, agent));

      const garbage = setup(
        new FakeProvider('anthropic', () =>
          Promise.resolve({ text: `${COMPLETION_SENTINEL} not json`, model: 'm' }),
        ),
      );
      await unavailableReason(garbage.service.draftResponse(TICKET_ID, agent));

      const text = loggedText();
      expect(text).toContain('outcome=ok');
      expect(text).toContain('outcome=failed');
      for (const sentinel of [PROMPT_SENTINEL, COMPLETION_SENTINEL, KEY_SENTINEL]) {
        expect(text).not.toContain(sentinel);
      }
    });
  });
});

describe('buildSearchQuery', () => {
  it('joins distinct words with or and drops short ones', () => {
    expect(buildSearchQuery('VPN is dropping, VPN!')).toBe('vpn or dropping');
  });

  it('cannot smuggle search operators', () => {
    expect(buildSearchQuery('"a b" -evil & | (quoted)')).toBe('evil or quoted');
  });

  it('is null when nothing searchable remains', () => {
    expect(buildSearchQuery('a b ?!')).toBeNull();
  });
});
