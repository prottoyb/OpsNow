import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = 'DevPassword123!';
// Every article this suite creates carries this run-unique marker in its
// TITLE, so assertions can be scoped to this run's rows and the seeded dev
// data is never touched.
const MARKER = `E2E-KB-${Date.now()}`;
// A word that appears in nothing the seed contains, so the full-text
// search assertions can look for a specific article rather than counting
// rows. Assertions are still written as "this id is/is not present"
// rather than exact totals, so leftovers from a crashed earlier run
// cannot make them flap.
const SEARCH_WORD = 'flibbertigibbet';

async function loginAs(app: INestApplication, email: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: SEED_PASSWORD });
  if (response.status !== 200) {
    throw new Error(
      `Seed login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return response.body.accessToken as string;
}

describe('Knowledge base (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let teamLeadToken: string;
  let agent1Token: string;
  let agent2Token: string;
  let employee1Token: string;
  let employee2Token: string;

  let agent1Id: string;
  let agent2Id: string;
  let employee1Id: string;
  let categoryId: string;

  const createdArticleIds: string[] = [];
  const createdTicketIds: string[] = [];
  let titleCounter = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    adminToken = await loginAs(app, 'admin@opsnow.local');
    teamLeadToken = await loginAs(app, 'teamlead@opsnow.local');
    agent1Token = await loginAs(app, 'agent1@opsnow.local');
    agent2Token = await loginAs(app, 'agent2@opsnow.local');
    employee1Token = await loginAs(app, 'employee1@opsnow.local');
    employee2Token = await loginAs(app, 'employee2@opsnow.local');

    const usersRes = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`);
    const findUser = (email: string) =>
      usersRes.body.data.find((u: { email: string }) => u.email === email).id;
    agent1Id = findUser('agent1@opsnow.local');
    agent2Id = findUser('agent2@opsnow.local');
    employee1Id = findUser('employee1@opsnow.local');

    const categoriesRes = await request(app.getHttpServer())
      .get('/api/v1/kb-categories')
      .set('Authorization', `Bearer ${employee1Token}`);
    categoryId = categoriesRes.body[0].id;
  });

  afterAll(async () => {
    // Remove only what this run created, and nothing else.
    //
    // One scoped deleteMany on the articles is enough for their children:
    // both KnowledgeBaseArticleFeedback.article and
    // TicketKnowledgeArticle.article are declared `onDelete: Cascade` in
    // prisma/schema.prisma, so Postgres removes the feedback rows and the
    // ticket links itself. (KnowledgeBaseArticle.category is SetNull and
    // .author is Restrict, so no category or user can be reached from
    // here either way.)
    if (createdArticleIds.length > 0) {
      await prisma.knowledgeBaseArticle.deleteMany({
        where: { id: { in: createdArticleIds } },
      });
    }
    if (createdTicketIds.length > 0) {
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    await app.close();
  });

  async function createArticle(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    titleCounter += 1;
    const response = await request(app.getHttpServer())
      .post('/api/v1/kb-articles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `${MARKER} article ${titleCounter}`,
        content: 'Written by the knowledge base e2e suite.',
        ...overrides,
      });
    if (response.status === 201) {
      createdArticleIds.push(response.body.id);
    }
    return response;
  }

  /** Creates an article and publishes it with an editorial account, since
   * a SupportAgent deliberately cannot publish. */
  async function createPublishedArticle(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const created = await createArticle(agent1Token, overrides);
    expect(created.status).toBe(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/kb-articles/${created.body.id}`)
      .set('Authorization', `Bearer ${teamLeadToken}`)
      .send({ status: 'Published' })
      .expect(200);
    return created.body.id;
  }

  async function createTicket(token: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: `${MARKER} kb-link ticket`,
        description: 'A ticket created by the knowledge base e2e suite.',
      });
    if (response.status === 201) {
      createdTicketIds.push(response.body.id);
    }
    return response;
  }

  describe('GET /kb-categories', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/kb-categories',
      );
      expect(response.status).toBe(401);
    });

    it('returns a bare array of active categories to any authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-categories')
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      for (const category of response.body) {
        expect(category.isActive).toBe(true);
        expect(Object.keys(category).sort()).toEqual([
          'id',
          'isActive',
          'name',
          'parentId',
        ]);
      }
    });

    it('exposes no category CRUD — the taxonomy is admin-managed seed data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/kb-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Should not exist' });
      expect(response.status).toBe(404);
    });
  });

  describe('POST /kb-articles', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/kb-articles')
        .send({ title: 'x', content: 'y' });
      expect(response.status).toBe(401);
    });

    it('rejects an Employee', async () => {
      const response = await createArticle(employee1Token);
      expect(response.status).toBe(403);
    });

    it('creates a Draft authored by the caller, with a derived slug', async () => {
      const response = await createArticle(agent1Token);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('Draft');
      expect(response.body.publishedAt).toBeNull();
      expect(response.body.viewCount).toBe(0);
      expect(response.body.author.id).toBe(agent1Id);
      expect(response.body.author).not.toHaveProperty('email');
      expect(response.body.slug).toContain(MARKER.toLowerCase());
      expect(response.body.feedback).toEqual({
        helpfulCount: 0,
        notHelpfulCount: 0,
        myFeedback: null,
      });
    });

    it('accepts an active categoryId', async () => {
      const response = await createArticle(agent1Token, { categoryId });
      expect(response.status).toBe(201);
      expect(response.body.category.id).toBe(categoryId);
    });

    it('rejects an unknown categoryId', async () => {
      const response = await createArticle(agent1Token, {
        categoryId: '00000000-0000-0000-0000-000000000000',
      });
      expect(response.status).toBe(400);
    });

    it('derives distinct slugs for two articles with the same title', async () => {
      const title = `${MARKER} duplicate title`;
      const first = await createArticle(agent1Token, { title });
      const second = await createArticle(agent1Token, { title });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.slug).not.toBe(first.body.slug);
      expect(second.body.slug.startsWith(first.body.slug)).toBe(true);
    });

    it.each([
      ['title', { title: 'x'.repeat(201) }],
      ['content', { content: 'x'.repeat(50001) }],
    ])('rejects an oversized %s', async (_label, overrides) => {
      const response = await createArticle(agent1Token, overrides);
      expect(response.status).toBe(400);
    });

    it.each([
      ['status', { status: 'Published' }],
      ['slug', { slug: 'chosen-by-the-client' }],
      ['authorId', { authorId: '00000000-0000-0000-0000-000000000000' }],
      ['viewCount', { viewCount: 9999 }],
      ['publishedAt', { publishedAt: '2026-01-01T00:00:00.000Z' }],
    ])('refuses a client-supplied %s', async (_label, overrides) => {
      const response = await createArticle(agent1Token, overrides);
      expect(response.status).toBe(400);
    });
  });

  describe('visibility', () => {
    let draftId: string;
    let publishedId: string;

    beforeAll(async () => {
      const draft = await createArticle(agent1Token);
      draftId = draft.body.id;
      publishedId = await createPublishedArticle();
    });

    it('returns 404 (not 403) to an Employee for a Draft', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${draftId}`)
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Knowledge article not found');
    });

    it.each([
      ['SupportAgent', () => agent1Token],
      ['TeamLead', () => teamLeadToken],
      ['Administrator', () => adminToken],
    ])('lets a %s read a Draft', async (_label, token) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${draftId}`)
        .set('Authorization', `Bearer ${token()}`);
      expect(response.status).toBe(200);
      expect(response.body.content).toContain('e2e suite');
    });

    it('lets an Employee read a Published article', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${publishedId}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(200);
    });

    it('returns 404 for a nonexistent id and 400 for a malformed one', async () => {
      const missing = await request(app.getHttpServer())
        .get('/api/v1/kb-articles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(missing.status).toBe(404);

      const malformed = await request(app.getHttpServer())
        .get('/api/v1/kb-articles/not-a-uuid')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(malformed.status).toBe(400);
    });

    it('never lists a non-Published article to an Employee', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.every(
          (a: { status: string }) => a.status === 'Published',
        ),
      ).toBe(true);
      expect(
        response.body.data.some((a: { id: string }) => a.id === draftId),
      ).toBe(false);
    });

    it('does not let an Employee widen their scope with status=Draft', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ status: 'Draft', limit: 100 })
        .set('Authorization', `Bearer ${employee1Token}`);

      // The visibility clause is ANDed in, so the filter can only narrow:
      // an empty page rather than a 403 or a leak.
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('lets staff filter by status and author', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ status: 'Draft', authorId: agent1Id, limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.every(
          (a: { status: string; author: { id: string } }) =>
            a.status === 'Draft' && a.author.id === agent1Id,
        ),
      ).toBe(true);
      expect(
        response.body.data.some((a: { id: string }) => a.id === draftId),
      ).toBe(true);
    });

    it('returns an excerpt and no full content in the list projection', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      for (const article of response.body.data) {
        expect(article).not.toHaveProperty('content');
        expect(article).toHaveProperty('excerpt');
        expect(article.author).not.toHaveProperty('email');
      }
    });

    it.each([
      ['limit=0', { limit: 0 }],
      ['limit=101', { limit: 101 }],
      ['offset=-1', { offset: -1 }],
      ['an unknown query param', { foo: 'bar' }],
    ])('rejects GET /kb-articles with an invalid query (%s)', async (_label, query) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query(query)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(400);
    });
  });

  describe('view counting', () => {
    it('counts reads of a Published article', async () => {
      const id = await createPublishedArticle();

      const first = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      const second = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(first.body.viewCount).toBe(1);
      expect(second.body.viewCount).toBe(2);
    });

    it('does not count a staff preview of a Draft', async () => {
      const created = await createArticle(agent1Token);

      await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .expect(200);
      const second = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(second.body.viewCount).toBe(0);
    });

    it('does not let a read bump updatedAt — that would break the edit CAS', async () => {
      const id = await createPublishedArticle();
      const before = await prisma.knowledgeBaseArticle.findUniqueOrThrow({
        where: { id },
      });

      await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .expect(200);

      const after = await prisma.knowledgeBaseArticle.findUniqueOrThrow({
        where: { id },
      });
      expect(after.viewCount).toBe(before.viewCount + 1);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });
  });

  describe('PATCH /kb-articles/:id — authoring rules', () => {
    it('rejects an Employee', async () => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ title: 'hijacked' });
      expect(response.status).toBe(403);
    });

    it('lets a SupportAgent edit their own article', async () => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ title: `${MARKER} edited by author`, categoryId });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe(`${MARKER} edited by author`);
      expect(response.body.category.id).toBe(categoryId);
      // The slug is frozen at creation so inbound links keep working.
      expect(response.body.slug).toBe(created.body.slug);
    });

    it("rejects a SupportAgent editing another agent's article with 403, not 404", async () => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent2Token}`)
        .send({ title: `${MARKER} hijacked` });

      expect(response.status).toBe(403);

      // ...and agent2 CAN read it, which is exactly why 404 would be wrong.
      const read = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent2Token}`);
      expect(read.status).toBe(200);
      expect(read.body.author.id).toBe(agent1Id);
      expect(agent2Id).not.toBe(agent1Id);
    });

    it.each([
      ['TeamLead', () => teamLeadToken],
      ['Administrator', () => adminToken],
    ])("lets a %s edit another author's article", async (_label, token) => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ content: 'Corrected by an editor.' });

      expect(response.status).toBe(200);
      expect(response.body.content).toBe('Corrected by an editor.');
    });

    it('rejects an unknown categoryId and accepts null to clear it', async () => {
      const created = await createArticle(agent1Token, { categoryId });

      const bad = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ categoryId: '00000000-0000-0000-0000-000000000000' });
      expect(bad.status).toBe(400);

      const cleared = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ categoryId: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.category).toBeNull();
    });

    it('exposes no delete route — Archived is the retire path', async () => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /kb-articles/:id — status transitions', () => {
    it('rejects a SupportAgent publishing their OWN article', async () => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Published' });

      expect(response.status).toBe(403);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(after.body.status).toBe('Draft');
    });

    it('rejects a SupportAgent re-submitting the CURRENT status', async () => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Draft' });
      expect(response.status).toBe(403);
    });

    it.each([
      ['TeamLead', () => teamLeadToken],
      ['Administrator', () => adminToken],
    ])('lets a %s publish, setting publishedAt', async (_label, token) => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${token()}`)
        .send({ status: 'Published' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('Published');
      expect(response.body.publishedAt).not.toBeNull();
    });

    it('leaves publishedAt in place when unpublishing or archiving', async () => {
      const id = await createPublishedArticle();
      const published = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`);
      const publishedAt = published.body.publishedAt;
      expect(publishedAt).not.toBeNull();

      const unpublished = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ status: 'Draft' });
      expect(unpublished.status).toBe(200);
      expect(unpublished.body.publishedAt).toBe(publishedAt);

      const archived = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ status: 'Archived' });
      expect(archived.status).toBe(200);
      expect(archived.body.publishedAt).toBe(publishedAt);
    });

    it('rejects Archived -> Published with a 400', async () => {
      const id = await createPublishedArticle();
      await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ status: 'Archived' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Published' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Archived to Published');
    });

    it('allows Archived -> Draft, so retired guidance can be rewritten', async () => {
      const id = await createPublishedArticle();
      await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ status: 'Archived' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ status: 'Draft' });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('Draft');
    });

    it('treats an editorial no-op status submission as success', async () => {
      const created = await createArticle(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${created.body.id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ status: 'Draft', title: `${MARKER} copy-edited` });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('Draft');
      expect(response.body.title).toBe(`${MARKER} copy-edited`);
    });

    it('hides an archived article from an Employee', async () => {
      const id = await createPublishedArticle();
      await request(app.getHttpServer())
        .patch(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ status: 'Archived' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${id}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(404);
    });
  });

  describe('full-text search', () => {
    let publishedId: string;
    let draftId: string;

    beforeAll(async () => {
      publishedId = await createPublishedArticle({
        title: `${MARKER} published ${SEARCH_WORD} guidance`,
        content: `Resolving a ${SEARCH_WORD} fault on the corporate network.`,
      });
      const draft = await createArticle(agent1Token, {
        title: `${MARKER} draft ${SEARCH_WORD} notes`,
        content: `Internal ${SEARCH_WORD} escalation notes, not yet reviewed.`,
      });
      draftId = draft.body.id;
    });

    it('finds the published article by a word from its body', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ q: SEARCH_WORD, limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.some((a: { id: string }) => a.id === publishedId),
      ).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });

    it("never returns a Draft in an Employee's search results", async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ q: SEARCH_WORD, limit: 100 })
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.some((a: { id: string }) => a.id === draftId),
      ).toBe(false);
      expect(
        response.body.data.some((a: { id: string }) => a.id === publishedId),
      ).toBe(true);
      expect(
        response.body.data.every((a: { status: string }) => a.status === 'Published'),
      ).toBe(true);
    });

    it('does not let an Employee reach a Draft by combining q with status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ q: SEARCH_WORD, status: 'Draft', limit: 100 })
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('returns the draft to staff searching the same term', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ q: SEARCH_WORD, status: 'Draft', limit: 100 })
        .set('Authorization', `Bearer ${teamLeadToken}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.some((a: { id: string }) => a.id === draftId),
      ).toBe(true);
    });

    it.each([
      ["a SQL injection attempt", "'; DROP TABLE users;--"],
      ['an ILIKE wildcard', '%'],
      ['an ILIKE single-char wildcard', '_'],
      ['a lone backslash', '\\'],
      ['bare tsquery operators', '& | !'],
      ['an unbalanced quote', '"unclosed phrase'],
      ['a prefix operator', ':*'],
      ['a tsquery phrase operator', '<->'],
      ['mixed nonsense', "!!! & | <-> ':*"],
    ])('survives %s without a 500', async (_label, q) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ q, limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('left the users table intact after the injection attempt', async () => {
      // The term is a bound parameter, so the statement above was only
      // ever a search. Prove it rather than assume it.
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('treats an all-whitespace q as absent', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ q: '   ', limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('scopes search by categoryId too', async () => {
      const categorised = await createPublishedArticle({
        title: `${MARKER} categorised ${SEARCH_WORD}`,
        content: `A categorised ${SEARCH_WORD} article.`,
        categoryId,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ q: SEARCH_WORD, categoryId, limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.every(
          (a: { category: { id: string } | null }) => a.category?.id === categoryId,
        ),
      ).toBe(true);
      expect(
        response.body.data.some((a: { id: string }) => a.id === categorised),
      ).toBe(true);
    });
  });

  describe('article feedback', () => {
    let publishedId: string;
    let draftId: string;

    beforeAll(async () => {
      publishedId = await createPublishedArticle();
      const draft = await createArticle(agent1Token);
      draftId = draft.body.id;
    });

    it('rejects an unauthenticated vote', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/kb-articles/${publishedId}/feedback`)
        .send({ isHelpful: true });
      expect(response.status).toBe(401);
    });

    it('lets an Employee rate a Published article', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/kb-articles/${publishedId}/feedback`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ isHelpful: true, comment: 'Solved it, thanks.' });

      expect(response.status).toBe(201);
      expect(response.body.helpfulCount).toBe(1);
      expect(response.body.notHelpfulCount).toBe(0);
      expect(response.body.myFeedback).toMatchObject({
        isHelpful: true,
        comment: 'Solved it, thanks.',
      });
    });

    it('404s for an Employee rating a Draft', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/kb-articles/${draftId}/feedback`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ isHelpful: true });
      expect(response.status).toBe(404);
    });

    it('replaces the previous vote instead of 409ing on the unique key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/kb-articles/${publishedId}/feedback`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ isHelpful: false, comment: 'Actually the second step is stale.' });

      expect(response.status).toBe(201);
      // One person still holds exactly one opinion.
      expect(response.body.helpfulCount).toBe(0);
      expect(response.body.notHelpfulCount).toBe(1);
      expect(response.body.myFeedback.isHelpful).toBe(false);
    });

    it('counts a second voter separately', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/kb-articles/${publishedId}/feedback`)
        .set('Authorization', `Bearer ${employee2Token}`)
        .send({ isHelpful: true });

      expect(response.status).toBe(201);
      expect(response.body.helpfulCount).toBe(1);
      expect(response.body.notHelpfulCount).toBe(1);
      // employee2 sees their own vote, never employee1's.
      expect(response.body.myFeedback.isHelpful).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('second step is stale');
    });

    it('rejects a vote with no isHelpful', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/kb-articles/${publishedId}/feedback`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ comment: 'no vote' });
      expect(response.status).toBe(400);
    });

    it("embeds only aggregates and the caller's own vote in the article detail", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${publishedId}`)
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(Object.keys(response.body.feedback).sort()).toEqual([
        'helpfulCount',
        'myFeedback',
        'notHelpfulCount',
      ]);
      expect(response.body.feedback.myFeedback.isHelpful).toBe(false);
    });

    it('never shows an Employee another reader’s comment', async () => {
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${publishedId}`)
        .set('Authorization', `Bearer ${employee2Token}`);
      expect(detail.status).toBe(200);
      expect(JSON.stringify(detail.body)).not.toContain('second step is stale');

      const list = await request(app.getHttpServer())
        .get('/api/v1/kb-articles')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${employee2Token}`);
      expect(JSON.stringify(list.body)).not.toContain('second step is stale');
    });

    it('rejects an Employee reading the feedback log', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${publishedId}/feedback`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(403);
    });

    it.each([
      ['SupportAgent', () => agent1Token],
      ['TeamLead', () => teamLeadToken],
      ['Administrator', () => adminToken],
    ])('lets a %s read the feedback log', async (_label, token) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/kb-articles/${publishedId}/feedback`)
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${token()}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      const mine = response.body.data.find(
        (row: { user: { id: string } }) => row.user.id === employee1Id,
      );
      expect(mine.comment).toBe('Actually the second step is stale.');
      expect(mine.user).not.toHaveProperty('email');
    });

    it('404s on the feedback log for an article the caller cannot see', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/kb-articles/00000000-0000-0000-0000-000000000000/feedback')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(404);
    });
  });

  describe('ticket <-> knowledge article links', () => {
    let ticketId: string;
    let publishedId: string;
    let draftId: string;

    beforeAll(async () => {
      const ticket = await createTicket(employee1Token);
      ticketId = ticket.body.id;
      publishedId = await createPublishedArticle();
      const draft = await createArticle(agent1Token);
      draftId = draft.body.id;
    });

    it('rejects an Employee attempting to link', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ articleId: publishedId });
      expect(response.status).toBe(403);
    });

    it('rejects linking an article that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ articleId: '00000000-0000-0000-0000-000000000000' });
      expect(response.status).toBe(400);
    });

    it('links an article, embedding only the summary', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ articleId: publishedId });

      expect(response.status).toBe(201);
      expect(response.body.article.id).toBe(publishedId);
      expect(response.body.article).not.toHaveProperty('content');
      expect(response.body.linkedBy.id).toBe(agent1Id);
      expect(response.body.linkedBy).not.toHaveProperty('email');
    });

    it('is idempotent: re-linking returns the existing link, not an error', async () => {
      const before = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`);
      const linkedAt = before.body.find(
        (l: { article: { id: string } }) => l.article.id === publishedId,
      ).linkedAt;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ articleId: publishedId });

      expect(response.status).toBe(201);
      expect(response.body.linkedAt).toBe(linkedAt);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(
        after.body.filter(
          (l: { article: { id: string } }) => l.article.id === publishedId,
        ),
      ).toHaveLength(1);
    });

    it('lets staff link a Draft', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ articleId: draftId });
      expect(response.status).toBe(201);
    });

    it('shows staff both links', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      const ids = response.body.map((l: { article: { id: string } }) => l.article.id);
      expect(ids).toEqual(expect.arrayContaining([publishedId, draftId]));
    });

    it("hides the Draft link from the ticket's own requester", async () => {
      // The link route is additionally article-scoped, because a Draft's
      // EXISTENCE is staff information — unlike the asset equivalent,
      // where a uniform narrow projection was sufficient.
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      const ids = response.body.map((l: { article: { id: string } }) => l.article.id);
      expect(ids).toContain(publishedId);
      expect(ids).not.toContain(draftId);
      expect(JSON.stringify(response.body)).not.toContain(draftId);
    });

    it.each([
      [
        'GET',
        (server: unknown, tid: string) =>
          request(server as never).get(
            `/api/v1/tickets/${tid}/knowledge-articles`,
          ),
      ],
      [
        'POST',
        (server: unknown, tid: string) =>
          request(server as never)
            .post(`/api/v1/tickets/${tid}/knowledge-articles`)
            .send({ articleId: '00000000-0000-0000-0000-000000000000' }),
      ],
    ])(
      'leaks nothing about a ticket outside the caller scope via %s',
      async (_method, buildRequest) => {
        const response = await buildRequest(app.getHttpServer(), ticketId).set(
          'Authorization',
          `Bearer ${employee2Token}`,
        );
        // 404 for the readable route, 403 for the staff-only one — in no
        // case does an out-of-scope caller learn that links exist.
        expect([403, 404]).toContain(response.status);

        const { path: _echoedPath, ...informative } = response.body as Record<
          string,
          unknown
        >;
        expect(JSON.stringify(informative)).not.toContain(publishedId);
        expect(JSON.stringify(informative)).not.toContain(ticketId);
        expect(informative).not.toHaveProperty('article');
        expect(informative).not.toHaveProperty('linkedAt');
      },
    );

    it('returns 404 when staff ask for a nonexistent ticket', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/api/v1/tickets/00000000-0000-0000-0000-000000000000/knowledge-articles',
        )
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(404);
    });

    it('rejects an Employee attempting to unlink', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/tickets/${ticketId}/knowledge-articles/${publishedId}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(403);
    });

    it('unlinks with 204, and unlinking again is still 204', async () => {
      const first = await request(app.getHttpServer())
        .delete(`/api/v1/tickets/${ticketId}/knowledge-articles/${publishedId}`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(first.status).toBe(204);

      const second = await request(app.getHttpServer())
        .delete(`/api/v1/tickets/${ticketId}/knowledge-articles/${publishedId}`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(second.status).toBe(204);

      const links = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/knowledge-articles`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(
        links.body.some(
          (l: { article: { id: string } }) => l.article.id === publishedId,
        ),
      ).toBe(false);
    });
  });

  describe('seeded data is left untouched', () => {
    it('still has exactly the three seeded articles alongside this run’s', async () => {
      // A guard on the suite itself: nothing here may reset or reseed the
      // shared dev database.
      const seeded = await prisma.knowledgeBaseArticle.findMany({
        where: { slug: { in: [
          'how-to-reset-your-password',
          'setting-up-your-new-laptop',
          'vpn-connection-issues',
        ] } },
      });
      expect(seeded).toHaveLength(3);
      expect(
        seeded.find((a) => a.slug === 'vpn-connection-issues')?.status,
      ).toBe('Draft');
    });
  });
});
