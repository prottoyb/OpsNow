import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { KnowledgeArticleStatus, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { knowledgeArticleVisibilityWhere } from '../common/knowledge-article-visibility';
import { KnowledgeBaseCategoriesService } from '../knowledge-base-categories/knowledge-base-categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseService } from './knowledge-base.service';

function buildUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    email: 'agent@opsnow.local',
    passwordHash: 'hash',
    firstName: 'Ada',
    lastName: 'Ng',
    role: Role.SupportAgent,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    name: 'Troubleshooting',
    parentId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'article-1',
    categoryId: 'cat-1',
    authorId: 'agent-1',
    title: 'VPN Connection Issues',
    slug: 'vpn-connection-issues',
    content: 'Check the split-tunnel config before escalating.',
    status: KnowledgeArticleStatus.Draft,
    viewCount: 7,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    category: buildCategory(),
    author: buildUserRecord(),
    ...overrides,
  };
}

function authUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'employee-1',
    email: 'employee@opsnow.local',
    role: Role.Employee,
    ...overrides,
  };
}

const employeeUser = authUser();
const agentUser = authUser({
  id: 'agent-1',
  email: 'agent@opsnow.local',
  role: Role.SupportAgent,
});
const otherAgentUser = authUser({
  id: 'agent-2',
  email: 'agent2@opsnow.local',
  role: Role.SupportAgent,
});
const teamLeadUser = authUser({
  id: 'lead-1',
  email: 'lead@opsnow.local',
  role: Role.TeamLead,
});
const adminUser = authUser({
  id: 'admin-1',
  email: 'admin@opsnow.local',
  role: Role.Administrator,
});

function prismaError(
  code: string,
  target?: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('constraint failed', {
    code,
    clientVersion: 'test',
    meta: target ? { target } : undefined,
  });
}

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let prisma: {
    knowledgeBaseArticle: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    knowledgeBaseArticleFeedback: {
      upsert: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    ticketKnowledgeArticle: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let categoriesService: { findActiveById: jest.Mock };

  beforeEach(() => {
    prisma = {
      knowledgeBaseArticle: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      knowledgeBaseArticleFeedback: {
        upsert: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      ticketKnowledgeArticle: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    categoriesService = { findActiveById: jest.fn() };

    service = new KnowledgeBaseService(
      prisma as unknown as PrismaService,
      categoriesService as unknown as KnowledgeBaseCategoriesService,
    );
  });

  // -------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------

  describe('visibility', () => {
    it.each([
      [Role.Employee, { deletedAt: null, status: KnowledgeArticleStatus.Published }],
      [Role.SupportAgent, { deletedAt: null }],
      [Role.TeamLead, { deletedAt: null }],
      [Role.Administrator, { deletedAt: null }],
    ])('scopes %s to %j', (role, expected) => {
      expect(knowledgeArticleVisibilityWhere(authUser({ role }))).toEqual(expected);
    });

    it('404s (never 403s) when an article is outside the caller scope', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(null);

      await expect(service.findOne('article-1', employeeUser)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('article-1', employeeUser)).rejects.toThrow(
        'Knowledge article not found',
      );
    });

    it("applies the Employee's Published-only clause to the read query itself", async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(null);

      await expect(service.findOne('article-1', employeeUser)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.knowledgeBaseArticle.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'article-1',
            deletedAt: null,
            status: KnowledgeArticleStatus.Published,
          }),
        }),
      );
    });

    it('lets staff read a Draft', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(buildArticle());

      const result = await service.findOne('article-1', agentUser);

      expect(result.status).toBe(KnowledgeArticleStatus.Draft);
      expect(result.content).toBe(
        'Check the split-tunnel config before escalating.',
      );
    });
  });

  // -------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------

  describe('create', () => {
    it('rejects an Employee', async () => {
      await expect(
        service.create({ title: 'T', content: 'C' }, employeeUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.knowledgeBaseArticle.create).not.toHaveBeenCalled();
    });

    it('always creates a Draft authored by the caller, with a derived slug', async () => {
      const created = buildArticle({ id: 'new-1' });
      prisma.knowledgeBaseArticle.create.mockResolvedValue(created);
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(created);

      await service.create(
        { title: 'How to Reset Your Password!', content: 'Body' },
        agentUser,
      );

      expect(prisma.knowledgeBaseArticle.create).toHaveBeenCalledWith({
        data: {
          title: 'How to Reset Your Password!',
          content: 'Body',
          categoryId: null,
          authorId: 'agent-1',
          slug: 'how-to-reset-your-password',
          status: KnowledgeArticleStatus.Draft,
          publishedAt: null,
        },
      });
    });

    it('rejects an inactive/unknown categoryId before writing anything', async () => {
      categoriesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.create({ title: 'T', content: 'C', categoryId: 'cat-x' }, agentUser),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.knowledgeBaseArticle.create).not.toHaveBeenCalled();
    });

    it('retries with a -2 suffix when the slug collides', async () => {
      const created = buildArticle({ id: 'new-1', slug: 'vpn-issues-2' });
      prisma.knowledgeBaseArticle.create
        .mockRejectedValueOnce(prismaError('P2002', ['slug']))
        .mockResolvedValueOnce(created);
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(created);

      await service.create({ title: 'VPN Issues', content: 'Body' }, agentUser);

      expect(prisma.knowledgeBaseArticle.create).toHaveBeenCalledTimes(2);
      expect(
        prisma.knowledgeBaseArticle.create.mock.calls[0][0].data.slug,
      ).toBe('vpn-issues');
      expect(
        prisma.knowledgeBaseArticle.create.mock.calls[1][0].data.slug,
      ).toBe('vpn-issues-2');
    });

    it('gives up with a 409 after a bounded number of slug collisions', async () => {
      prisma.knowledgeBaseArticle.create.mockRejectedValue(
        prismaError('P2002', ['slug']),
      );

      await expect(
        service.create({ title: 'VPN Issues', content: 'Body' }, agentUser),
      ).rejects.toThrow(ConflictException);
      // Bounded: the loop must not retry forever.
      expect(prisma.knowledgeBaseArticle.create).toHaveBeenCalledTimes(5);
    });

    it('does not retry a non-slug unique violation as though it were one', async () => {
      prisma.knowledgeBaseArticle.create.mockRejectedValue(
        prismaError('P2002', ['some_other_key']),
      );

      await expect(
        service.create({ title: 'VPN Issues', content: 'Body' }, agentUser),
      ).rejects.toThrow(ConflictException);
      expect(prisma.knowledgeBaseArticle.create).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  // findOne / view counting
  // -------------------------------------------------------------------

  describe('findOne view counting', () => {
    it('increments and returns the post-increment count for a Published article', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Published, viewCount: 7 }),
      );

      const result = await service.findOne('article-1', employeeUser);

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(result.viewCount).toBe(8);
    });

    it.each([KnowledgeArticleStatus.Draft, KnowledgeArticleStatus.Archived])(
      'does not count a staff preview of a %s article',
      async (status) => {
        prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
          buildArticle({ status, viewCount: 7 }),
        );

        const result = await service.findOne('article-1', teamLeadUser);

        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(result.viewCount).toBe(7);
      },
    );

    it('still serves the article when the counter write fails', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Published, viewCount: 7 }),
      );
      prisma.$executeRaw.mockRejectedValue(new Error('deadlock detected'));

      const result = await service.findOne('article-1', employeeUser);

      expect(result.id).toBe('article-1');
      expect(result.viewCount).toBe(7);
    });

    it('reports the unchanged count when the conditional increment matched nothing', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Published, viewCount: 7 }),
      );
      prisma.$executeRaw.mockResolvedValue(0);

      const result = await service.findOne('article-1', employeeUser);

      expect(result.viewCount).toBe(7);
    });
  });

  // -------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------

  describe('update authoring rules', () => {
    beforeEach(() => {
      prisma.knowledgeBaseArticle.updateMany.mockResolvedValue({ count: 1 });
    });

    it('rejects an Employee outright', async () => {
      await expect(
        service.update('article-1', { title: 'x' }, employeeUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.knowledgeBaseArticle.findFirst).not.toHaveBeenCalled();
    });

    it('lets a SupportAgent edit an article they authored', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ authorId: 'agent-1' }),
      );

      await service.update('article-1', { title: 'Rewritten' }, agentUser);

      expect(prisma.knowledgeBaseArticle.updateMany).toHaveBeenCalledTimes(1);
    });

    it("rejects a SupportAgent editing another agent's article with 403, not 404", async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ authorId: 'agent-1' }),
      );

      // They can READ it (staff see every non-deleted article), so hiding
      // it behind a 404 would be both a lie and a worse error message.
      await expect(
        service.update('article-1', { title: 'Rewritten' }, otherAgentUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.knowledgeBaseArticle.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ['TeamLead', teamLeadUser],
      ['Administrator', adminUser],
    ])("lets a %s edit another author's article", async (_label, user) => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ authorId: 'agent-1' }),
      );

      await service.update('article-1', { content: 'Corrected' }, user);

      expect(prisma.knowledgeBaseArticle.updateMany).toHaveBeenCalledTimes(1);
    });

    it('rejects a SupportAgent publishing even their OWN article', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ authorId: 'agent-1' }),
      );

      await expect(
        service.update(
          'article-1',
          { status: KnowledgeArticleStatus.Published },
          agentUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.knowledgeBaseArticle.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a SupportAgent submitting the CURRENT status — presence is what is checked', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ authorId: 'agent-1', status: KnowledgeArticleStatus.Draft }),
      );

      await expect(
        service.update(
          'article-1',
          { status: KnowledgeArticleStatus.Draft },
          agentUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an inactive categoryId', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(buildArticle());
      categoriesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.update('article-1', { categoryId: 'cat-x' }, teamLeadUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a null categoryId without a category lookup — that is how it is cleared', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(buildArticle());

      await service.update('article-1', { categoryId: null }, teamLeadUser);

      expect(categoriesService.findActiveById).not.toHaveBeenCalled();
      expect(
        prisma.knowledgeBaseArticle.updateMany.mock.calls[0][0].data,
      ).toEqual({ categoryId: null });
    });
  });

  describe('update status transitions', () => {
    beforeEach(() => {
      prisma.knowledgeBaseArticle.updateMany.mockResolvedValue({ count: 1 });
    });

    it('sets publishedAt when publishing', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Draft, publishedAt: null }),
      );

      await service.update(
        'article-1',
        { status: KnowledgeArticleStatus.Published },
        teamLeadUser,
      );

      const { data } = prisma.knowledgeBaseArticle.updateMany.mock.calls[0][0];
      expect(data.status).toBe(KnowledgeArticleStatus.Published);
      expect(data.publishedAt).toBeInstanceOf(Date);
    });

    it('refreshes publishedAt on a RE-publish', async () => {
      const old = new Date('2020-01-01T00:00:00.000Z');
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Draft, publishedAt: old }),
      );

      await service.update(
        'article-1',
        { status: KnowledgeArticleStatus.Published },
        adminUser,
      );

      const { data } = prisma.knowledgeBaseArticle.updateMany.mock.calls[0][0];
      expect((data.publishedAt as Date).getTime()).toBeGreaterThan(old.getTime());
    });

    it.each([
      ['unpublishing', KnowledgeArticleStatus.Draft],
      ['archiving', KnowledgeArticleStatus.Archived],
    ])('leaves publishedAt untouched when %s', async (_label, status) => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({
          status: KnowledgeArticleStatus.Published,
          publishedAt: new Date('2026-02-02T00:00:00.000Z'),
        }),
      );

      await service.update('article-1', { status }, teamLeadUser);

      const { data } = prisma.knowledgeBaseArticle.updateMany.mock.calls[0][0];
      expect(data.status).toBe(status);
      expect(data).not.toHaveProperty('publishedAt');
    });

    it('rejects Archived -> Published with a 400 that names both statuses', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Archived }),
      );

      await expect(
        service.update(
          'article-1',
          { status: KnowledgeArticleStatus.Published },
          adminUser,
        ),
      ).rejects.toThrow(/Archived to Published/);
      expect(prisma.knowledgeBaseArticle.updateMany).not.toHaveBeenCalled();
    });

    it('treats a same-status submission as a no-op, not an error', async () => {
      const article = buildArticle({ status: KnowledgeArticleStatus.Published });
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(article);

      const result = await service.update(
        'article-1',
        { status: KnowledgeArticleStatus.Published },
        teamLeadUser,
      );

      expect(prisma.knowledgeBaseArticle.updateMany).not.toHaveBeenCalled();
      expect(result.status).toBe(KnowledgeArticleStatus.Published);
    });

    it('writes nothing when every submitted value already matches', async () => {
      const article = buildArticle();
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(article);

      await service.update(
        'article-1',
        { title: article.title, content: article.content },
        teamLeadUser,
      );

      expect(prisma.knowledgeBaseArticle.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update concurrency', () => {
    it('409s when the CAS predicate matches no row', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(buildArticle());
      prisma.knowledgeBaseArticle.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('article-1', { title: 'Rewritten' }, teamLeadUser),
      ).rejects.toThrow(ConflictException);
    });

    it('pins the write on updatedAt AND re-asserts visibility as a separate ANDed clause', async () => {
      const article = buildArticle();
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(article);
      prisma.knowledgeBaseArticle.updateMany.mockResolvedValue({ count: 1 });

      await service.update('article-1', { title: 'Rewritten' }, agentUser);

      const { where } = prisma.knowledgeBaseArticle.updateMany.mock.calls[0][0];
      // Never spread together: for an Employee the visibility helper
      // yields its own `status` key, which a spread could silently
      // overwrite.
      expect(where).toEqual({
        AND: [
          { deletedAt: null },
          { id: 'article-1', updatedAt: article.updatedAt },
        ],
      });
    });

    it('never recomputes the slug on a retitle — inbound links must keep working', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(buildArticle());
      prisma.knowledgeBaseArticle.updateMany.mockResolvedValue({ count: 1 });

      await service.update(
        'article-1',
        { title: 'A Completely Different Title' },
        adminUser,
      );

      const { data } = prisma.knowledgeBaseArticle.updateMany.mock.calls[0][0];
      expect(data).not.toHaveProperty('slug');
    });
  });

  // -------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------

  describe('findAll', () => {
    beforeEach(() => {
      prisma.knowledgeBaseArticle.findMany.mockResolvedValue([buildArticle()]);
      prisma.knowledgeBaseArticle.count.mockResolvedValue(1);
    });

    it('ANDs visibility as its own clause so a filter can only narrow', async () => {
      await service.findAll(
        { limit: 20, offset: 0, status: KnowledgeArticleStatus.Draft },
        employeeUser,
      );

      const { where } = prisma.knowledgeBaseArticle.findMany.mock.calls[0][0];
      expect(where).toEqual({
        AND: [
          { deletedAt: null, status: KnowledgeArticleStatus.Published },
          { status: KnowledgeArticleStatus.Draft },
        ],
      });
    });

    it('orders by publishedAt desc NULLS LAST, then updatedAt, then id', async () => {
      await service.findAll({ limit: 20, offset: 0 }, agentUser);

      const { orderBy } = prisma.knowledgeBaseArticle.findMany.mock.calls[0][0];
      expect(orderBy).toEqual([
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ]);
    });

    it('returns an excerpt instead of the full content', async () => {
      prisma.knowledgeBaseArticle.findMany.mockResolvedValue([
        buildArticle({ content: 'word '.repeat(500) }),
      ]);

      const result = await service.findAll({ limit: 20, offset: 0 }, agentUser);

      expect(result.data[0]).not.toHaveProperty('content');
      expect(result.data[0].excerpt.length).toBeLessThan(250);
    });

    it('never embeds an email address in the author summary', async () => {
      const result = await service.findAll({ limit: 20, offset: 0 }, agentUser);

      expect(result.data[0].author).toEqual({
        id: 'agent-1',
        firstName: 'Ada',
        lastName: 'Ng',
        role: Role.SupportAgent,
      });
      expect(JSON.stringify(result)).not.toContain('agent@opsnow.local');
    });

    it('batches the feedback counts into one grouped query for the whole page', async () => {
      prisma.knowledgeBaseArticle.findMany.mockResolvedValue([
        buildArticle({ id: 'a' }),
        buildArticle({ id: 'b' }),
        buildArticle({ id: 'c' }),
      ]);
      prisma.knowledgeBaseArticleFeedback.groupBy.mockResolvedValue([
        { articleId: 'a', isHelpful: true, _count: { _all: 4 } },
        { articleId: 'a', isHelpful: false, _count: { _all: 1 } },
      ]);

      const result = await service.findAll({ limit: 20, offset: 0 }, agentUser);

      expect(prisma.knowledgeBaseArticleFeedback.groupBy).toHaveBeenCalledTimes(1);
      expect(result.data[0]).toMatchObject({ helpfulCount: 4, notHelpfulCount: 1 });
      expect(result.data[1]).toMatchObject({ helpfulCount: 0, notHelpfulCount: 0 });
    });

    it.each([[undefined], [''], ['   ']])(
      'treats q=%j as absent and stays on the Prisma path',
      async (q) => {
        await service.findAll({ limit: 20, offset: 0, q }, agentUser);

        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.knowledgeBaseArticle.findMany).toHaveBeenCalled();
      },
    );
  });

  // -------------------------------------------------------------------
  // Full-text search
  // -------------------------------------------------------------------

  describe('findAll with q (raw full-text search)', () => {
    function rawQuery(index: number): Prisma.Sql {
      return prisma.$queryRaw.mock.calls[index][0] as Prisma.Sql;
    }

    beforeEach(() => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'article-1' }])
        .mockResolvedValueOnce([{ count: 1 }]);
      prisma.knowledgeBaseArticle.findMany.mockResolvedValue([buildArticle()]);
    });

    it('binds the search term as a parameter rather than interpolating it', async () => {
      const q = "'; DROP TABLE users;--";

      const result = await service.findAll({ limit: 20, offset: 0, q }, agentUser);

      expect(result.total).toBe(1);
      const sql = rawQuery(0);
      expect(sql.values).toContain(q);
      // The dangerous text never reaches the statement itself.
      expect(sql.text).not.toContain('DROP TABLE');
    });

    it.each([['%'], ['_'], ['\\'], ['& | !'], ['"unclosed'], [':*']])(
      'accepts the metacharacter term %j without special-casing it',
      async (q) => {
        const result = await service.findAll(
          { limit: 20, offset: 0, q },
          agentUser,
        );

        expect(result.total).toBe(1);
        expect(rawQuery(0).values).toContain(q);
      },
    );

    it('uses websearch_to_tsquery, which is total over arbitrary input', async () => {
      await service.findAll({ limit: 20, offset: 0, q: 'a & | b' }, agentUser);

      const text = rawQuery(0).text;
      expect(text).toContain('websearch_to_tsquery');
      // Every to_tsquery occurrence must be a websearch_to_tsquery one:
      // bare to_tsquery RAISES on malformed input and would 500.
      expect((text.match(/to_tsquery/g) ?? []).length).toBe(
        (text.match(/websearch_to_tsquery/g) ?? []).length,
      );
    });

    it("carries the Employee's Published-only predicate into the SQL", async () => {
      await service.findAll({ limit: 20, offset: 0, q: 'vpn' }, employeeUser);

      for (const index of [0, 1]) {
        const sql = rawQuery(index);
        expect(sql.text).toContain('a.deleted_at IS NULL');
        expect(sql.text).toContain('a.status =');
        expect(sql.values).toContain(KnowledgeArticleStatus.Published);
      }
    });

    it('does not restrict status for staff', async () => {
      await service.findAll({ limit: 20, offset: 0, q: 'vpn' }, agentUser);

      const sql = rawQuery(0);
      expect(sql.text).toContain('a.deleted_at IS NULL');
      expect(sql.values).not.toContain(KnowledgeArticleStatus.Published);
    });

    it('carries the categoryId/status/authorId filters into the SQL as parameters', async () => {
      await service.findAll(
        {
          limit: 20,
          offset: 0,
          q: 'vpn',
          categoryId: 'cat-1',
          status: KnowledgeArticleStatus.Draft,
          authorId: 'agent-1',
        },
        agentUser,
      );

      const sql = rawQuery(0);
      expect(sql.text).toContain('a.category_id =');
      expect(sql.text).toContain('a.author_id =');
      expect(sql.values).toEqual(
        expect.arrayContaining([
          'vpn',
          'cat-1',
          KnowledgeArticleStatus.Draft,
          'agent-1',
        ]),
      );
    });

    it('paginates in SQL', async () => {
      await service.findAll({ limit: 5, offset: 10, q: 'vpn' }, agentUser);

      const sql = rawQuery(0);
      expect(sql.text).toContain('LIMIT');
      expect(sql.text).toContain('OFFSET');
      expect(sql.values).toEqual(expect.arrayContaining([5, 10]));
    });

    it('re-applies the Prisma visibility clause when hydrating the ranked ids', async () => {
      await service.findAll({ limit: 20, offset: 0, q: 'vpn' }, employeeUser);

      const { where } = prisma.knowledgeBaseArticle.findMany.mock.calls[0][0];
      expect(where).toEqual({
        AND: [
          { deletedAt: null, status: KnowledgeArticleStatus.Published },
          { id: { in: ['article-1'] } },
        ],
      });
    });

    it('restores the rank order that findMany({ in }) discards', async () => {
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'c' }, { id: 'a' }, { id: 'b' }])
        .mockResolvedValueOnce([{ count: 3 }]);
      // Deliberately returned in a different order, as Postgres may.
      prisma.knowledgeBaseArticle.findMany.mockResolvedValue([
        buildArticle({ id: 'a' }),
        buildArticle({ id: 'b' }),
        buildArticle({ id: 'c' }),
      ]);

      const result = await service.findAll(
        { limit: 20, offset: 0, q: 'vpn' },
        agentUser,
      );

      expect(result.data.map((article) => article.id)).toEqual(['c', 'a', 'b']);
    });

    it('drops an id that the hydration query refused to return', async () => {
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'a' }, { id: 'missing' }])
        .mockResolvedValueOnce([{ count: 2 }]);
      prisma.knowledgeBaseArticle.findMany.mockResolvedValue([
        buildArticle({ id: 'a' }),
      ]);

      const result = await service.findAll(
        { limit: 20, offset: 0, q: 'vpn' },
        employeeUser,
      );

      expect(result.data.map((article) => article.id)).toEqual(['a']);
    });

    it('short-circuits the hydration when nothing matched', async () => {
      prisma.$queryRaw.mockReset();
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      const result = await service.findAll(
        { limit: 20, offset: 0, q: 'zzzz' },
        agentUser,
      );

      expect(result).toEqual({ data: [], total: 0 });
      expect(prisma.knowledgeBaseArticle.findMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Feedback
  // -------------------------------------------------------------------

  describe('submitFeedback', () => {
    it('lets an Employee rate an article they can see', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Published }),
      );
      prisma.knowledgeBaseArticleFeedback.groupBy.mockResolvedValue([
        { articleId: 'article-1', isHelpful: true, _count: { _all: 3 } },
      ]);

      const result = await service.submitFeedback(
        'article-1',
        { isHelpful: true },
        employeeUser,
      );

      expect(result.helpfulCount).toBe(3);
      expect(result.notHelpfulCount).toBe(0);
    });

    it('404s for an Employee rating a Draft', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(null);

      await expect(
        service.submitFeedback('article-1', { isHelpful: true }, employeeUser),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.knowledgeBaseArticleFeedback.upsert).not.toHaveBeenCalled();
    });

    it('upserts on (articleId, userId) so re-rating replaces rather than 409s', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Published }),
      );

      await service.submitFeedback(
        'article-1',
        { isHelpful: false, comment: 'Step 2 is out of date.' },
        employeeUser,
      );

      expect(prisma.knowledgeBaseArticleFeedback.upsert).toHaveBeenCalledWith({
        where: {
          articleId_userId: { articleId: 'article-1', userId: 'employee-1' },
        },
        create: {
          articleId: 'article-1',
          userId: 'employee-1',
          isHelpful: false,
          comment: 'Step 2 is out of date.',
        },
        update: { isHelpful: false, comment: 'Step 2 is out of date.' },
      });
    });

    it('clears a previous comment when the new vote carries none', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Published }),
      );

      await service.submitFeedback('article-1', { isHelpful: true }, employeeUser);

      const call = prisma.knowledgeBaseArticleFeedback.upsert.mock.calls[0][0];
      expect(call.update).toEqual({ isHelpful: true, comment: null });
    });

    it("returns the caller's own vote and nobody else's", async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(
        buildArticle({ status: KnowledgeArticleStatus.Published }),
      );
      prisma.knowledgeBaseArticleFeedback.findFirst.mockResolvedValue({
        id: 'f-1',
        articleId: 'article-1',
        userId: 'employee-1',
        isHelpful: true,
        comment: 'Mine',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      });

      const result = await service.submitFeedback(
        'article-1',
        { isHelpful: true },
        employeeUser,
      );

      expect(prisma.knowledgeBaseArticleFeedback.findFirst).toHaveBeenCalledWith({
        where: { articleId: 'article-1', userId: 'employee-1' },
      });
      expect(result.myFeedback).toEqual({
        isHelpful: true,
        comment: 'Mine',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      });
    });
  });

  describe('findFeedback', () => {
    it('rejects an Employee, even for an article they can read', async () => {
      await expect(
        service.findFeedback('article-1', { limit: 20, offset: 0 }, employeeUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.knowledgeBaseArticleFeedback.findMany).not.toHaveBeenCalled();
    });

    it('returns the comments with a user summary that omits the email', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(buildArticle());
      prisma.knowledgeBaseArticleFeedback.findMany.mockResolvedValue([
        {
          id: 'f-1',
          articleId: 'article-1',
          userId: 'employee-1',
          isHelpful: false,
          comment: 'Confusing.',
          createdAt: new Date(),
          user: buildUserRecord({
            id: 'employee-1',
            email: 'employee@opsnow.local',
            role: Role.Employee,
          }),
        },
      ]);
      prisma.knowledgeBaseArticleFeedback.count.mockResolvedValue(1);

      const result = await service.findFeedback(
        'article-1',
        { limit: 20, offset: 0 },
        teamLeadUser,
      );

      expect(result.total).toBe(1);
      expect(result.data[0].user).not.toHaveProperty('email');
      expect(JSON.stringify(result)).not.toContain('employee@opsnow.local');
    });

    it('404s for an article the caller cannot see before reading any feedback', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(null);

      await expect(
        service.findFeedback('article-1', { limit: 20, offset: 0 }, agentUser),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.knowledgeBaseArticleFeedback.findMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Ticket links
  // -------------------------------------------------------------------

  describe('ticket <-> article links', () => {
    function buildLink(overrides: Record<string, unknown> = {}) {
      return {
        ticketId: 'ticket-1',
        articleId: 'article-1',
        linkedAt: new Date('2026-03-01T00:00:00.000Z'),
        linkedById: 'agent-1',
        article: buildArticle(),
        linkedBy: buildUserRecord(),
        ...overrides,
      };
    }

    it("scopes the listing by the CALLER's article visibility", async () => {
      prisma.ticketKnowledgeArticle.findMany.mockResolvedValue([]);

      await service.findForTicket('ticket-1', employeeUser);

      expect(prisma.ticketKnowledgeArticle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ticketId: 'ticket-1',
            article: {
              deletedAt: null,
              status: KnowledgeArticleStatus.Published,
            },
          },
        }),
      );
    });

    it('does not narrow the listing by status for staff', async () => {
      prisma.ticketKnowledgeArticle.findMany.mockResolvedValue([buildLink()]);

      const result = await service.findForTicket('ticket-1', agentUser);

      const { where } = prisma.ticketKnowledgeArticle.findMany.mock.calls[0][0];
      expect(where.article).toEqual({ deletedAt: null });
      expect(result[0].article.status).toBe(KnowledgeArticleStatus.Draft);
    });

    it('embeds only the article summary — never the body', async () => {
      prisma.ticketKnowledgeArticle.findMany.mockResolvedValue([buildLink()]);

      const result = await service.findForTicket('ticket-1', agentUser);

      expect(result[0].article).not.toHaveProperty('content');
      expect(result[0].linkedBy).not.toHaveProperty('email');
    });

    it('rejects an Employee linking', async () => {
      await expect(
        service.linkToTicket('ticket-1', 'article-1', employeeUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.ticketKnowledgeArticle.create).not.toHaveBeenCalled();
    });

    it('400s when the article does not exist', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue(null);

      await expect(
        service.linkToTicket('ticket-1', 'article-x', agentUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('is idempotent: an existing link is returned untouched', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.ticketKnowledgeArticle.findFirst.mockResolvedValue(buildLink());

      const result = await service.linkToTicket('ticket-1', 'article-1', agentUser);

      expect(prisma.ticketKnowledgeArticle.create).not.toHaveBeenCalled();
      expect(result.article.id).toBe('article-1');
    });

    it('resolves a concurrent-link race (P2002) by returning the winner', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.ticketKnowledgeArticle.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildLink());
      prisma.ticketKnowledgeArticle.create.mockRejectedValue(prismaError('P2002'));

      const result = await service.linkToTicket('ticket-1', 'article-1', agentUser);

      expect(result.ticketId).toBe('ticket-1');
    });

    it('409s if the racing link vanished again before the re-read', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.ticketKnowledgeArticle.findFirst.mockResolvedValue(null);
      prisma.ticketKnowledgeArticle.create.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.linkToTicket('ticket-1', 'article-1', agentUser),
      ).rejects.toThrow(ConflictException);
    });

    it('links a Draft for staff — "we are writing this up for you" is legitimate', async () => {
      prisma.knowledgeBaseArticle.findFirst.mockResolvedValue({ id: 'article-1' });
      prisma.ticketKnowledgeArticle.findFirst.mockResolvedValue(null);
      prisma.ticketKnowledgeArticle.create.mockResolvedValue(buildLink());

      await service.linkToTicket('ticket-1', 'article-1', agentUser);

      expect(prisma.knowledgeBaseArticle.findFirst).toHaveBeenCalledWith({
        where: { id: 'article-1', deletedAt: null },
        select: { id: true },
      });
    });

    it('rejects an Employee unlinking', async () => {
      await expect(
        service.unlinkFromTicket('ticket-1', 'article-1', employeeUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.ticketKnowledgeArticle.deleteMany).not.toHaveBeenCalled();
    });

    it('unlinks idempotently via deleteMany', async () => {
      prisma.ticketKnowledgeArticle.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.unlinkFromTicket('ticket-1', 'article-1', agentUser),
      ).resolves.toBeUndefined();

      expect(prisma.ticketKnowledgeArticle.deleteMany).toHaveBeenCalledWith({
        where: { ticketId: 'ticket-1', articleId: 'article-1' },
      });
    });
  });
});
