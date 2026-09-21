import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = 'DevPassword123!';
const RUN = Date.now();
// Every request this suite makes carries this User-Agent, so every audit row
// it causes is identifiable (and removable) without touching anyone else's.
const UA = `E2E-AUDIT-${RUN}`;
const MARKER = `E2E-AUDIT-${RUN}`;

// Sentinels: must never appear in ANY audit row.
const RUN_EMAIL = `e2e-audit-${RUN}@opsnow.local`;
const RUN_PASSWORD = `Sentinel-Good-Pass-${RUN}`;
const WRONG_PASSWORD = `Sentinel-Wrong-Pass-${RUN}`;
const GHOST_EMAIL = `e2e-audit-ghost-${RUN}@opsnow.local`;

const ROUTE = '/api/v1/audit-logs';

describe('Audit logging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let teamLeadToken: string;
  let agent1Token: string;
  let employee1Token: string;
  let adminId: string;
  let agent1Id: string;
  let hardwareCategoryId: string;
  let otherCategoryId: string;

  let runUserId: string;
  let runUserAccessToken: string;
  let runUserRefreshCookie: string;
  let ticketId: string;
  const createdTicketIds: string[] = [];

  const runStart = new Date();
  let preExistingAuditCount: number;
  let preExistingUserCount: number;
  let preExistingTickets: Map<string, number>;

  function http() {
    return request(app.getHttpServer());
  }

  function call(
    method: 'get' | 'post' | 'patch',
    path: string,
    token?: string | null,
  ) {
    const req = http()[method](`/api/v1${path}`).set('User-Agent', UA);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  async function loginSeed(email: string): Promise<string> {
    const response = await call('post', '/auth/login').send({
      email,
      password: SEED_PASSWORD,
    });
    if (response.status !== 200) {
      throw new Error(
        `Seed login failed for ${email} (${response.status}). The development ` +
          'database must already be seeded (npm run prisma:seed in backend/); ' +
          'this suite never seeds or resets it.',
      );
    }
    return response.body.accessToken as string;
  }

  async function auditRows(query: Record<string, string | number> = {}) {
    const response = await call('get', '/audit-logs', adminToken).query({
      limit: 100,
      ...query,
    });
    expect(response.status).toBe(200);
    return response.body as { data: any[]; total: number };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Preconditions are verified, never repaired.
    adminToken = await loginSeed('admin@opsnow.local');
    teamLeadToken = await loginSeed('teamlead@opsnow.local');
    agent1Token = await loginSeed('agent1@opsnow.local');
    employee1Token = await loginSeed('employee1@opsnow.local');

    const users = await prisma.user.findMany({
      where: { email: { in: ['admin@opsnow.local', 'agent1@opsnow.local'] } },
      select: { id: true, email: true },
    });
    adminId = users.find((u) => u.email === 'admin@opsnow.local')!.id;
    agent1Id = users.find((u) => u.email === 'agent1@opsnow.local')!.id;

    const categories = await prisma.ticketCategory.findMany({
      where: { isActive: true },
      take: 2,
      orderBy: { name: 'asc' },
    });
    if (categories.length < 2) {
      throw new Error(
        'At least two seeded ticket categories are required; seed the dev database first.',
      );
    }
    hardwareCategoryId = categories[0].id;
    otherCategoryId = categories[1].id;

    // Snapshot everything that pre-dates this run to prove it survives.
    preExistingAuditCount = await prisma.auditLog.count({
      where: { createdAt: { lt: runStart } },
    });
    preExistingUserCount = await prisma.user.count();
    preExistingTickets = new Map(
      (await prisma.ticket.findMany({ select: { id: true, updatedAt: true } })).map(
        (t) => [t.id, t.updatedAt.getTime()],
      ),
    );
  });

  afterAll(async () => {
    // Best-effort and scoped to THIS run only. Audit rows are append-only by
    // design in the product, so this is the one place they are deleted:
    // rows carrying this run's User-Agent, rows about this run's tickets or
    // user, and failed-login rows for this run's identifiers.
    try {
      const entityIds = [...createdTicketIds, ...(runUserId ? [runUserId] : [])];
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userAgent: UA },
            ...(entityIds.length ? [{ entityId: { in: entityIds } }] : []),
            { metadata: { path: ['identifier'], equals: GHOST_EMAIL } },
            { metadata: { path: ['identifier'], equals: RUN_EMAIL } },
          ],
        },
      });
      await prisma.ticket.deleteMany({
        where: {
          OR: [
            { id: { in: createdTicketIds } },
            { subject: { startsWith: MARKER } },
          ],
        },
      });
      if (runUserId) {
        await prisma.refreshToken.deleteMany({ where: { userId: runUserId } });
        await prisma.user.deleteMany({ where: { id: runUserId } });
      }
    } catch (error) {
      console.warn('audit e2e cleanup failed', error);
    }
    await app.close();
  });

  describe('GET /audit-logs role matrix', () => {
    it('401 without a token', async () => {
      const res = await call('get', '/audit-logs');
      expect(res.status).toBe(401);
    });

    it.each([
      ['Employee', () => employee1Token],
      ['SupportAgent', () => agent1Token],
      ['TeamLead', () => teamLeadToken],
    ])('403 for %s', async (_role, token) => {
      const res = await call('get', '/audit-logs', token());
      expect(res.status).toBe(403);
    });

    it('200 for Administrator, in the standard {data,total} envelope', async () => {
      const res = await call('get', '/audit-logs', adminToken);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total).toBe('number');
    });

    it('has no write routes (append-only)', async () => {
      for (const method of ['post', 'patch'] as const) {
        const res = await call(method, '/audit-logs', adminToken).send({});
        expect([404, 405]).toContain(res.status);
      }
      const del = await http()
        .delete(ROUTE)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(del.status).toBe(404);
    });
  });

  describe('filter validation', () => {
    it.each([
      ['actorId', 'not-a-uuid'],
      ['entityId', 'not-a-uuid'],
      ['action', 'drop.table'],
      ['entityType', 'Widget'],
      ['outcome', 'maybe'],
      ['from', 'yesterday'],
      ['to', '12345'],
      ['limit', '0'],
      ['limit', '101'],
      ['offset', '-1'],
    ])('400 for invalid %s=%s', async (key, value) => {
      const res = await call('get', '/audit-logs', adminToken).query({
        [key]: value,
      });
      expect(res.status).toBe(400);
    });

    it('400 when to is before from', async () => {
      const res = await call('get', '/audit-logs', adminToken).query({
        from: '2026-02-01T00:00:00Z',
        to: '2026-01-01T00:00:00Z',
      });
      expect(res.status).toBe(400);
    });

    it('400 for an unknown query parameter (whitelist)', async () => {
      const res = await call('get', '/audit-logs', adminToken).query({
        password: 'x',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('authentication events', () => {
    it('records registration, a successful login, failed logins, refresh and logout', async () => {
      const registered = await call('post', '/auth/register').send({
        email: RUN_EMAIL,
        password: RUN_PASSWORD,
        firstName: 'Audit',
        lastName: 'Runner',
      });
      expect(registered.status).toBe(201);
      runUserId = registered.body.id;

      const login = await call('post', '/auth/login').send({
        email: RUN_EMAIL,
        password: RUN_PASSWORD,
      });
      expect(login.status).toBe(200);
      runUserAccessToken = login.body.accessToken;
      runUserRefreshCookie = (
        login.headers['set-cookie'] as unknown as string[]
      )
        .find((c) => c.startsWith('refresh_token='))!
        .split(';')[0];

      const badPassword = await call('post', '/auth/login').send({
        email: RUN_EMAIL,
        password: WRONG_PASSWORD,
      });
      expect(badPassword.status).toBe(401);

      const ghost = await call('post', '/auth/login').send({
        email: GHOST_EMAIL,
        password: WRONG_PASSWORD,
      });
      expect(ghost.status).toBe(401);

      const refresh = await call('post', '/auth/refresh').set(
        'Cookie',
        runUserRefreshCookie,
      );
      expect(refresh.status).toBe(200);
      const rotatedCookie = (
        refresh.headers['set-cookie'] as unknown as string[]
      )
        .find((c) => c.startsWith('refresh_token='))!
        .split(';')[0];
      // Replaying the consumed token is reuse -> family revoked.
      const replay = await call('post', '/auth/refresh').set(
        'Cookie',
        runUserRefreshCookie,
      );
      expect(replay.status).toBe(401);
      runUserRefreshCookie = rotatedCookie;

      // Log in again so there is a live token to log out with (the reuse
      // above revoked the family).
      const login2 = await call('post', '/auth/login').send({
        email: RUN_EMAIL,
        password: RUN_PASSWORD,
      });
      const cookie2 = (login2.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith('refresh_token='))!
        .split(';')[0];
      const logout = await call('post', '/auth/logout').set('Cookie', cookie2);
      expect(logout.status).toBe(204);

      const { data } = await auditRows({ entityId: runUserId });
      const actions = data.map((r) => r.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'auth.registered',
          'auth.login.succeeded',
          'auth.login.failed',
          'auth.token.refreshed',
          'auth.token.refresh_failed',
          'auth.logout',
        ]),
      );

      const success = data.find((r) => r.action === 'auth.login.succeeded');
      expect(success.outcome).toBe('success');
      expect(success.actor.id).toBe(runUserId);
      expect(success.userAgent).toBe(UA);
      // IP is available from req.ip on the auth routes.
      expect(success.ipAddress).toEqual(expect.any(String));

      const failed = data.find((r) => r.action === 'auth.login.failed');
      expect(failed.outcome).toBe('failure');
      expect(failed.actor).toBeNull();
      expect(failed.metadata).toEqual({
        outcome: 'failure',
        reason: 'bad_password',
        identifier: RUN_EMAIL,
      });

      const reuse = data.find((r) => r.action === 'auth.token.refresh_failed');
      expect(reuse.metadata.reason).toBe('reuse_detected');
    });

    it('records a login for an unknown account by identifier, with no entity', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { metadata: { path: ['identifier'], equals: GHOST_EMAIL } },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('auth.login.failed');
      expect(rows[0].entityId).toBeNull();
      expect(rows[0].actorId).toBeNull();
      expect((rows[0].metadata as any).reason).toBe('unknown_account');
    });
  });

  describe('ticket and assignment events', () => {
    it('records create, update, status, priority, assignment and unassignment', async () => {
      const created = await call('post', '/tickets', runUserAccessToken).send({
        subject: `${MARKER} subject`,
        description: `${MARKER} free-text description`,
        categoryId: hardwareCategoryId,
        priority: 'Medium',
      });
      expect(created.status).toBe(201);
      ticketId = created.body.id;
      createdTicketIds.push(ticketId);

      const updated = await call('patch', `/tickets/${ticketId}`, runUserAccessToken).send({
        subject: `${MARKER} edited subject`,
        categoryId: otherCategoryId,
      });
      expect(updated.status).toBe(200);

      expect(
        (await call('patch', `/tickets/${ticketId}/status`, agent1Token).send({
          status: 'Open',
        })).status,
      ).toBe(200);
      expect(
        (await call('patch', `/tickets/${ticketId}/priority`, agent1Token).send({
          priority: 'High',
        })).status,
      ).toBe(200);
      expect(
        (await call('patch', `/tickets/${ticketId}/assignment`, agent1Token).send({
          assigneeId: agent1Id,
        })).status,
      ).toBe(200);
      expect(
        (await call('patch', `/tickets/${ticketId}/assignment`, agent1Token).send({
          assigneeId: null,
        })).status,
      ).toBe(200);

      const { data } = await auditRows({ entityType: 'Ticket', entityId: ticketId });
      const byAction = (a: string) => data.filter((r) => r.action === a);

      const c = byAction('ticket.created')[0];
      expect(c.actor.id).toBe(runUserId);
      expect(c.outcome).toBe('success');
      expect(c.metadata.priority).toBe('Medium');
      expect(c.metadata.categoryId).toBe(hardwareCategoryId);

      const u = byAction('ticket.updated')[0];
      expect(u.metadata.changedFields.sort()).toEqual(['categoryId', 'subject']);
      expect(u.metadata.categoryIdFrom).toBe(hardwareCategoryId);
      expect(u.metadata.categoryIdTo).toBe(otherCategoryId);

      expect(byAction('ticket.status_changed')[0].metadata).toMatchObject({
        from: 'New',
        to: 'Open',
      });
      expect(byAction('ticket.priority_changed')[0].metadata).toMatchObject({
        from: 'Medium',
        to: 'High',
      });
      const assigned = byAction('ticket.assigned')[0];
      expect(assigned.metadata).toMatchObject({ from: null, to: agent1Id });
      expect(assigned.actor.id).toBe(agent1Id);
      expect(byAction('ticket.unassigned')[0].metadata).toMatchObject({
        from: agent1Id,
        to: null,
      });

      // Free text is deliberately NOT copied into the audit log.
      expect(JSON.stringify(data)).not.toContain(MARKER);
    });

    it('does not write an audit row for a failed ticket operation', async () => {
      const before = (await auditRows({ entityId: ticketId })).total;
      const res = await call('patch', `/tickets/${ticketId}/status`, agent1Token).send({
        status: 'Open', // already Open -> 400
      });
      expect(res.status).toBe(400);
      expect((await auditRows({ entityId: ticketId })).total).toBe(before);
    });
  });

  describe('permission-sensitive events', () => {
    it('records an access.denied row with role, requirement and route pattern', async () => {
      const denied = await call('get', '/audit-logs', runUserAccessToken);
      expect(denied.status).toBe(403);

      const { data } = await auditRows({
        action: 'access.denied',
        actorId: runUserId,
      });
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data[0].outcome).toBe('denied');
      expect(data[0].metadata).toMatchObject({
        actorRole: 'Employee',
        requiredRoles: ['Administrator'],
        method: 'GET',
        route: '/api/v1/audit-logs',
      });
      expect(data[0].userAgent).toBe(UA);
    });
  });

  describe('filters', () => {
    it('filters by actor, action, entity, outcome and date range, newest first', async () => {
      const byActor = await auditRows({ actorId: runUserId });
      expect(byActor.data.length).toBeGreaterThan(0);
      expect(byActor.data.every((r) => r.actor.id === runUserId)).toBe(true);

      const byAction = await auditRows({
        action: 'ticket.created',
        entityId: ticketId,
      });
      expect(byAction.total).toBe(1);

      const failures = await auditRows({
        outcome: 'failure',
        entityId: runUserId,
      });
      expect(failures.data.length).toBeGreaterThan(0);
      expect(failures.data.every((r) => r.outcome === 'failure')).toBe(true);

      const inRange = await auditRows({
        entityId: ticketId,
        from: runStart.toISOString(),
        to: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(inRange.total).toBeGreaterThan(0);
      const none = await auditRows({
        entityId: ticketId,
        to: new Date(runStart.getTime() - 60_000).toISOString(),
      });
      expect(none.total).toBe(0);

      const times = inRange.data.map((r) => new Date(r.createdAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('paginates with limit/offset and a stable total', async () => {
      const all = await auditRows({ entityId: ticketId });
      const page = await auditRows({ entityId: ticketId, limit: 2, offset: 1 });
      expect(page.total).toBe(all.total);
      expect(page.data.map((r) => r.id)).toEqual(
        all.data.slice(1, 3).map((r) => r.id),
      );
    });
  });

  describe('secrets never reach the audit log', () => {
    it('no row this run caused contains a password, token or hash', async () => {
      const rows = await prisma.auditLog.findMany({
        where: {
          OR: [
            { userAgent: UA },
            { entityId: { in: [...createdTicketIds, runUserId] } },
          ],
        },
      });
      expect(rows.length).toBeGreaterThan(10);

      const serialised = JSON.stringify(rows);
      const runUser = await prisma.user.findUniqueOrThrow({
        where: { id: runUserId },
      });
      const refreshTokens = await prisma.refreshToken.findMany({
        where: { userId: runUserId },
        select: { tokenHash: true },
      });

      const secrets = [
        RUN_PASSWORD,
        WRONG_PASSWORD,
        SEED_PASSWORD,
        runUser.passwordHash,
        runUserAccessToken,
        runUserRefreshCookie.replace('refresh_token=', ''),
        adminToken,
        agent1Token,
        ...refreshTokens.map((t) => t.tokenHash),
      ];
      for (const secret of secrets) {
        expect(secret.length).toBeGreaterThan(10);
        expect(serialised).not.toContain(secret);
      }
      expect(serialised).not.toMatch(/argon2/i);
      expect(serialised).not.toMatch(/bearer/i);
      expect(serialised).not.toMatch(/authorization/i);

      // And the API view of them, as the administrator sees it.
      const api = JSON.stringify(
        (await auditRows({ entityId: runUserId })).data,
      );
      expect(api).not.toContain(RUN_PASSWORD);
      expect(api).not.toContain(WRONG_PASSWORD);
      expect(api).not.toContain(runUser.passwordHash);
      expect(adminId).toBeDefined();
    });

    it('a serialised page never throws (no BigInt in the response)', async () => {
      const res = await call('get', '/audit-logs', adminToken).query({ limit: 100 });
      expect(res.status).toBe(200);
      expect(typeof res.body.total).toBe('number');
    });
  });

  describe('pre-existing data is untouched', () => {
    it('leaves seeded users, tickets and earlier audit rows exactly as they were', async () => {
      expect(await prisma.user.count()).toBe(preExistingUserCount + 1); // + run user
      const tickets = await prisma.ticket.findMany({
        where: { id: { in: [...preExistingTickets.keys()] } },
        select: { id: true, updatedAt: true },
      });
      expect(tickets).toHaveLength(preExistingTickets.size);
      for (const t of tickets) {
        expect(t.updatedAt.getTime()).toBe(preExistingTickets.get(t.id));
      }
      expect(
        await prisma.auditLog.count({ where: { createdAt: { lt: runStart } } }),
      ).toBe(preExistingAuditCount);
    });
  });
});
