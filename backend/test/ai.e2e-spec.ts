import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AI_PROVIDER } from '../src/ai/ai.types';
import { createAiProvider } from '../src/ai/ai.provider.factory';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = 'DevPassword123!';
// Every row this suite creates carries this run-unique marker. `ZQX` words are
// deliberately nonsense so the article search matches only rows made here.
const MARKER = `E2E-AI-${Date.now()}`;
const UNIQUE_WORD = `zqxjam${Date.now()}`;

const POST_ROUTES = ['triage', 'draft-response', 'resolution-summary'] as const;

async function bootApp(mode: 'default' | 'mock'): Promise<INestApplication> {
  // 'default' is the real provider selection under the Jest env pinning
  // (no key, provider disabled). 'mock' injects the provider the factory
  // builds for AI_PROVIDER=mock — the app itself is otherwise unchanged.
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (mode === 'mock') {
    builder = builder
      .overrideProvider(AI_PROVIDER)
      .useValue(createAiProvider({ provider: 'mock', model: 'mock', timeoutMs: 1000 }));
  }
  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

async function loginAs(app: INestApplication, email: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: SEED_PASSWORD });
  if (response.status !== 200) {
    throw new Error(
      `Seed login failed for ${email} (${response.status}). The development ` +
        'database must already be seeded (npm run prisma:seed in backend/); ' +
        'this suite never seeds or resets it.',
    );
  }
  return response.body.accessToken as string;
}

describe('AI ticket assistant (e2e)', () => {
  let defaultApp: INestApplication;
  let mockApp: INestApplication;
  let prisma: PrismaService;

  let agentToken: string;
  let teamLeadToken: string;
  let employeeToken: string;

  let ticketId: string;
  let publishedArticleId: string;
  let draftArticleId: string;
  const createdTicketIds: string[] = [];
  const createdArticleIds: string[] = [];
  let preExistingTickets: Map<string, number>;
  let preExistingArticles: Map<string, number>;

  beforeAll(async () => {
    defaultApp = await bootApp('default');
    mockApp = await bootApp('mock');
    prisma = mockApp.get(PrismaService);

    agentToken = await loginAs(mockApp, 'agent1@opsnow.local');
    teamLeadToken = await loginAs(mockApp, 'teamlead@opsnow.local');
    employeeToken = await loginAs(mockApp, 'employee1@opsnow.local');

    const categories = await request(mockApp.getHttpServer())
      .get('/api/v1/ticket-categories')
      .set('Authorization', `Bearer ${employeeToken}`);
    if (!Array.isArray(categories.body) || categories.body.length === 0) {
      throw new Error('Seeded ticket categories are missing; seed the dev database first.');
    }

    // Snapshot the pre-existing, seeded rows to prove at the end nothing
    // outside this run was touched.
    const tickets = await prisma.ticket.findMany({ select: { id: true, updatedAt: true } });
    preExistingTickets = new Map(tickets.map((t) => [t.id, t.updatedAt.getTime()]));
    const articles = await prisma.knowledgeBaseArticle.findMany({
      select: { id: true, updatedAt: true },
    });
    preExistingArticles = new Map(articles.map((a) => [a.id, a.updatedAt.getTime()]));

    const ticket = await request(mockApp.getHttpServer())
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        subject: `${MARKER} ${UNIQUE_WORD} printer`,
        description: 'Created by the AI e2e suite.',
        categoryId: categories.body[0].id,
        priority: 'Low',
      });
    expect(ticket.status).toBe(201);
    ticketId = ticket.body.id;
    createdTicketIds.push(ticketId);

    // One public and one internal comment, so "comment count unchanged" is
    // meaningful across both visibilities.
    for (const visibility of ['Public', 'Internal']) {
      await request(mockApp.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ body: `${MARKER} ${visibility} note`, visibility })
        .expect(201);
    }

    // A Published article and a Draft article that both match the ticket.
    const published = await request(mockApp.getHttpServer())
      .post('/api/v1/kb-articles')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: `${MARKER} ${UNIQUE_WORD} published guide`, content: `${UNIQUE_WORD} steps` });
    expect(published.status).toBe(201);
    publishedArticleId = published.body.id;
    createdArticleIds.push(publishedArticleId);
    await request(mockApp.getHttpServer())
      .patch(`/api/v1/kb-articles/${publishedArticleId}`)
      .set('Authorization', `Bearer ${teamLeadToken}`)
      .send({ status: 'Published' })
      .expect(200);

    const draft = await request(mockApp.getHttpServer())
      .post('/api/v1/kb-articles')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: `${MARKER} ${UNIQUE_WORD} draft notes`, content: `${UNIQUE_WORD} internal` });
    expect(draft.status).toBe(201);
    draftArticleId = draft.body.id;
    createdArticleIds.push(draftArticleId);
  });

  afterAll(async () => {
    // Best-effort, scoped to this run only, and run even after failures.
    // Ticket children (comments, history, SLA) and article links cascade.
    try {
      if (prisma) {
        await prisma.ticket.deleteMany({
          where: { OR: [{ id: { in: createdTicketIds } }, { subject: { startsWith: MARKER } }] },
        });
        await prisma.knowledgeBaseArticle.deleteMany({
          where: { OR: [{ id: { in: createdArticleIds } }, { title: { startsWith: MARKER } }] },
        });
      }
    } catch (error) {
      console.warn('ai e2e cleanup failed', error);
    }
    await defaultApp?.close();
    await mockApp?.close();
  });

  function post(app: INestApplication, route: string, token: string | null, id = ticketId) {
    const req = request(app.getHttpServer()).post(`/api/v1/tickets/${id}/ai/${route}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  function status(app: INestApplication, token: string | null) {
    const req = request(app.getHttpServer()).get('/api/v1/ai/status');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  async function ticketState(id = ticketId) {
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id },
      select: { priority: true, categoryId: true, status: true, updatedAt: true, assigneeId: true },
    });
    return {
      ...ticket,
      updatedAt: ticket.updatedAt.getTime(),
      history: await prisma.ticketHistory.count({ where: { ticketId: id } }),
      comments: await prisma.ticketComment.count({ where: { ticketId: id } }),
    };
  }

  describe('(a) default install: no key, no provider', () => {
    it('boots, and reports the feature as disabled', async () => {
      const res = await status(defaultApp, agentToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: false, mode: 'disabled' });
    });

    it.each(POST_ROUTES)('POST %s is 503 AI_UNAVAILABLE with reason disabled', async (route) => {
      const res = await post(defaultApp, route, agentToken);
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        statusCode: 503,
        code: 'AI_UNAVAILABLE',
        reason: 'disabled',
      });
    });

    it('ticket routes still work, and an AI failure changes nothing on the ticket', async () => {
      const before = await ticketState();
      await post(defaultApp, 'triage', agentToken).expect(503);

      const read = await request(defaultApp.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${agentToken}`);
      expect(read.status).toBe(200);

      const comment = await request(defaultApp.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ body: `${MARKER} written while AI is off` });
      expect(comment.status).toBe(201);

      const after = await ticketState();
      expect(after.priority).toBe(before.priority);
      expect(after.status).toBe(before.status);
      expect(after.comments).toBe(before.comments + 1);
    });
  });

  describe('(b) mock mode', () => {
    it('reports enabled mock mode to staff', async () => {
      const res = await status(mockApp, teamLeadToken);
      expect(res.body).toEqual({ enabled: true, mode: 'mock' });
    });

    it('triage returns a grounded, validated shape', async () => {
      const res = await post(mockApp, 'triage', agentToken);
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('mock');
      expect(res.body.suggestedPriority).toBe('Medium');
      expect(res.body.suggestedCategory).toEqual({
        id: expect.any(String),
        name: expect.any(String),
      });
      // The category name is the database row's, not text from the model.
      const category = await prisma.ticketCategory.findUniqueOrThrow({
        where: { id: res.body.suggestedCategory.id },
      });
      expect(res.body.suggestedCategory.name).toBe(category.name);
      expect(res.body.rationale).toContain('MOCK');
      for (const article of res.body.relatedArticles) {
        expect([publishedArticleId, draftArticleId]).toContain(article.id);
      }
      expect(res.body.relatedArticles).toHaveLength(1);
    });

    it('draft-response quotes Published articles only, even for staff', async () => {
      for (const token of [agentToken, teamLeadToken]) {
        const res = await post(mockApp, 'draft-response', token);
        expect(res.status).toBe(200);
        expect(res.body.draft).toContain('MOCK');
        expect(res.body.referencedArticles.map((a: { id: string }) => a.id)).toEqual([
          publishedArticleId,
        ]);
        expect(res.body.referencedArticles[0].title).toBe(
          `${MARKER} ${UNIQUE_WORD} published guide`,
        );
      }
    });

    it('resolution-summary returns a validated summary', async () => {
      const res = await post(mockApp, 'resolution-summary', agentToken);
      expect(res.status).toBe(200);
      expect(res.body.summary).toContain('MOCK');
      expect(res.body.mode).toBe('mock');
    });
  });

  describe('(c) authorisation', () => {
    it.each(POST_ROUTES)('%s: no token is 401', async (route) => {
      await post(mockApp, route, null).expect(401);
    });

    it.each(POST_ROUTES)('%s: an Employee is 403, even on their own ticket', async (route) => {
      await post(mockApp, route, employeeToken).expect(403);
    });

    it('status: no token is 401, and an Employee always sees enabled false', async () => {
      await status(mockApp, null).expect(401);
      const res = await status(mockApp, employeeToken);
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);
    });

    it.each(POST_ROUTES)('%s: an unknown or soft-deleted ticket is 404, not 403', async (route) => {
      await post(mockApp, route, agentToken, '00000000-0000-4000-8000-000000000000').expect(404);

      const doomed = await request(mockApp.getHttpServer())
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ subject: `${MARKER} soft deleted ${route}`, description: 'to be deleted' });
      expect(doomed.status).toBe(201);
      createdTicketIds.push(doomed.body.id);
      await prisma.ticket.update({ where: { id: doomed.body.id }, data: { deletedAt: new Date() } });
      await post(mockApp, route, agentToken, doomed.body.id).expect(404);
    });

    it('a malformed ticket id is a 400', async () => {
      await post(mockApp, 'triage', agentToken, 'not-a-uuid').expect(400);
    });
  });

  describe('(d) ticket state is never changed by an AI route', () => {
    it.each(POST_ROUTES)('%s leaves priority, category, status, updatedAt, history and comments identical', async (route) => {
      const before = await ticketState();
      await post(mockApp, route, agentToken).expect(200);
      await post(defaultApp, route, agentToken).expect(503);
      expect(await ticketState()).toEqual(before);
    });
  });

  describe('pre-existing data', () => {
    it('leaves every seeded ticket and article untouched', async () => {
      const tickets = await prisma.ticket.findMany({ select: { id: true, updatedAt: true } });
      const now = new Map(tickets.map((t) => [t.id, t.updatedAt.getTime()]));
      for (const [id, updatedAt] of preExistingTickets) {
        expect(now.get(id)).toBe(updatedAt);
      }
      const articles = await prisma.knowledgeBaseArticle.findMany({
        select: { id: true, updatedAt: true },
      });
      const nowArticles = new Map(articles.map((a) => [a.id, a.updatedAt.getTime()]));
      for (const [id, updatedAt] of preExistingArticles) {
        expect(nowArticles.get(id)).toBe(updatedAt);
      }
    });
  });
});
