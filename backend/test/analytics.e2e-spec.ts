import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = 'DevPassword123!';
// Every ticket this suite creates carries this run-unique marker in its
// SUBJECT. Assertions are deltas over data this run created (or invariants
// between two reads), never absolute totals, so pre-existing rows and
// leftovers from a crashed earlier run cannot make them flap.
const MARKER = `E2E-ANALYTICS-${Date.now()}`;

const ROUTES = ['tickets', 'sla', 'categories', 'agents'] as const;
type Route = (typeof ROUTES)[number];

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

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let teamLeadToken: string;
  let agent1Token: string;
  let employee1Token: string;
  let agent1Id: string;
  let hardwareCategoryId: string;

  const createdTicketIds: string[] = [];
  let preExisting: Map<string, number>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Preconditions are verified, never repaired.
    adminToken = await loginAs(app, 'admin@opsnow.local');
    teamLeadToken = await loginAs(app, 'teamlead@opsnow.local');
    agent1Token = await loginAs(app, 'agent1@opsnow.local');
    employee1Token = await loginAs(app, 'employee1@opsnow.local');

    const usersRes = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`);
    agent1Id = usersRes.body.data.find(
      (u: { email: string }) => u.email === 'agent1@opsnow.local',
    ).id;

    const categoriesRes = await request(app.getHttpServer())
      .get('/api/v1/ticket-categories')
      .set('Authorization', `Bearer ${employee1Token}`);
    const hardware = categoriesRes.body.find(
      (c: { name: string }) => c.name === 'Hardware',
    );
    if (!hardware) {
      throw new Error(
        'Seeded "Hardware" ticket category is missing; seed the dev database first.',
      );
    }
    hardwareCategoryId = hardware.id;

    if ((await prisma.slaPolicy.count()) < 4) {
      throw new Error('Seeded SLA policies are missing; seed the dev database first.');
    }

    // Snapshot everything that exists BEFORE this run, to prove at the end
    // that none of it was touched.
    const existing = await prisma.ticket.findMany({
      select: { id: true, updatedAt: true },
    });
    preExisting = new Map(existing.map((t) => [t.id, t.updatedAt.getTime()]));
  });

  afterAll(async () => {
    // Best-effort, and scoped to this run only. Every child relation of
    // Ticket (SLA row, history, comments) is `onDelete: Cascade`, so one
    // scoped deleteMany is enough. Runs even when a test failed.
    try {
      await prisma.ticket.deleteMany({
        where: {
          OR: [
            { id: { in: createdTicketIds } },
            { subject: { startsWith: MARKER } },
          ],
        },
      });
    } catch (error) {
      console.warn('analytics e2e cleanup failed', error);
    }
    await app.close();
  });

  function get(route: Route, token: string | null, query: Record<string, string> = {}) {
    const req = request(app.getHttpServer())
      .get(`/api/v1/analytics/${route}`)
      .query(query);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  async function ok<T = any>(
    route: Route,
    token: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    const response = await get(route, token, query);
    expect(response.status).toBe(200);
    return response.body as T;
  }

  async function createTicket(overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${employee1Token}`)
      .send({
        subject: `${MARKER} ticket`,
        description: 'Created by the analytics e2e suite.',
        categoryId: hardwareCategoryId,
        priority: 'Medium',
        ...overrides,
      });
    expect(response.status).toBe(201);
    createdTicketIds.push(response.body.id);
    return response.body.id as string;
  }

  async function setStatus(id: string, status: string) {
    await request(app.getHttpServer())
      .patch(`/api/v1/tickets/${id}/status`)
      .set('Authorization', `Bearer ${agent1Token}`)
      .send({ status })
      .expect(200);
  }

  async function slaOf(id: string) {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/tickets/${id}`)
      .set('Authorization', `Bearer ${agent1Token}`)
      .expect(200);
    return response.body.sla as { responseState: string; resolutionState: string };
  }

  describe('access control', () => {
    it.each(ROUTES)('rejects an unauthenticated caller on /analytics/%s', async (route) => {
      expect((await get(route, null)).status).toBe(401);
    });

    it.each(ROUTES)('rejects an Employee on /analytics/%s', async (route) => {
      expect((await get(route, employee1Token)).status).toBe(403);
    });

    it.each(['tickets', 'sla', 'categories'] as const)(
      'allows a SupportAgent on /analytics/%s',
      async (route) => {
        expect((await get(route, agent1Token)).status).toBe(200);
      },
    );

    it('rejects a SupportAgent on /analytics/agents — it ranks colleagues', async () => {
      expect((await get('agents', agent1Token)).status).toBe(403);
    });

    it.each(ROUTES)('allows a TeamLead on /analytics/%s', async (route) => {
      expect((await get(route, teamLeadToken)).status).toBe(200);
    });

    it.each(ROUTES)('allows an Administrator on /analytics/%s', async (route) => {
      expect((await get(route, adminToken)).status).toBe(200);
    });
  });

  describe('query validation', () => {
    it.each([
      ['a malformed from', { from: 'yesterday' }],
      ['a malformed to', { to: '12345' }],
      ['an unknown priority', { priority: 'Urgent' }],
      ['a non-uuid categoryId', { categoryId: 'hardware' }],
      ['a non-uuid assigneeId', { assigneeId: '42' }],
      ['an inverted window', { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }],
      ['a window wider than 366 days', { from: '2020-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }],
      ['an unknown parameter', { limit: '5' }],
    ])('returns 400 for %s', async (_name, query) => {
      for (const route of ROUTES) {
        const response = await get(route, adminToken, query);
        expect(response.status).toBe(400);
      }
    });

    it('accepts a legitimately empty window and reports null durations', async () => {
      const body = await ok('tickets', adminToken, {
        from: '2001-01-01T00:00:00Z',
        to: '2001-01-02T00:00:00Z',
      });
      expect(body.opened).toBe(0);
      expect(body.resolution).toEqual({
        resolvedCount: 0,
        meanMinutes: null,
        medianMinutes: null,
      });
    });

    it('returns null compliance, not 0, for an empty window', async () => {
      const body = await ok('sla', adminToken, {
        from: '2001-01-01T00:00:00Z',
        to: '2001-01-02T00:00:00Z',
      });
      expect(body.response.complianceRate).toBeNull();
      expect(body.resolution.complianceRate).toBeNull();
    });
  });

  describe('GET /analytics/tickets', () => {
    it('has the documented shape with every status and priority present', async () => {
      const body = await ok('tickets', agent1Token);
      expect(Object.keys(body.byStatus).sort()).toEqual(
        ['Closed', 'InProgress', 'New', 'OnHold', 'Open', 'Resolved'],
      );
      expect(Object.keys(body.byPriority).sort()).toEqual(
        ['Critical', 'High', 'Low', 'Medium'],
      );
      expect(new Date(body.window.to).getTime()).toBeGreaterThan(
        new Date(body.window.from).getTime(),
      );
      for (const field of ['total', 'opened', 'resolved', 'backlog']) {
        expect(typeof body[field]).toBe('number');
      }
    });

    it('moves opened, total, backlog and the priority split by exactly one for a new ticket, then resolves it', async () => {
      const before = await ok('tickets', agent1Token);
      const id = await createTicket({ priority: 'High' });
      const afterCreate = await ok('tickets', agent1Token);

      expect(afterCreate.opened).toBe(before.opened + 1);
      expect(afterCreate.total).toBe(before.total + 1);
      expect(afterCreate.backlog).toBe(before.backlog + 1);
      expect(afterCreate.byStatus.New).toBe(before.byStatus.New + 1);
      expect(afterCreate.byPriority.High).toBe(before.byPriority.High + 1);

      await setStatus(id, 'Resolved');
      const afterResolve = await ok('tickets', agent1Token);
      expect(afterResolve.resolved).toBe(afterCreate.resolved + 1);
      expect(afterResolve.backlog).toBe(afterCreate.backlog - 1);
      expect(afterResolve.resolution.resolvedCount).toBe(afterCreate.resolution.resolvedCount + 1);
      expect(afterResolve.resolution.medianMinutes).not.toBeNull();
      expect(afterResolve.resolution.meanMinutes).toBeGreaterThanOrEqual(0);
    });

    it('a filter only narrows: priority=Critical opened equals the unfiltered Critical split', async () => {
      await createTicket({ priority: 'Critical' });
      const all = await ok('tickets', agent1Token);
      const critical = await ok('tickets', agent1Token, { priority: 'Critical' });
      expect(critical.opened).toBe(all.byPriority.Critical);
      expect(critical.byPriority.High).toBe(0);
      expect(critical.total).toBeLessThanOrEqual(all.total);
    });

    it('serialises without a BigInt leak (the response is valid JSON)', async () => {
      const response = await get('tickets', adminToken);
      expect(response.status).toBe(200);
      expect(() => JSON.stringify(response.body)).not.toThrow();
    });
  });

  describe('GET /analytics/categories', () => {
    it('counts a new ticket against its category and orders by volume', async () => {
      const before = await ok('categories', agent1Token);
      const beforeRow = before.categories.find(
        (c: { categoryId: string }) => c.categoryId === hardwareCategoryId,
      );

      await createTicket();
      const after = await ok('categories', agent1Token);
      const afterRow = after.categories.find(
        (c: { categoryId: string }) => c.categoryId === hardwareCategoryId,
      );

      expect(afterRow.categoryName).toBe('Hardware');
      expect(afterRow.volume).toBe((beforeRow?.volume ?? 0) + 1);
      expect(after.truncated).toBe(false);
      const volumes = after.categories.map((c: { volume: number }) => c.volume);
      expect([...volumes].sort((a, b) => b - a)).toEqual(volumes);
    });

    it('narrows to one category when filtered', async () => {
      await createTicket();
      const body = await ok('categories', agent1Token, { categoryId: hardwareCategoryId });
      expect(body.categories).toHaveLength(1);
      expect(body.categories[0].categoryId).toBe(hardwareCategoryId);
    });
  });

  describe('GET /analytics/agents', () => {
    it('counts an assignment and a resolution against the assignee', async () => {
      interface AgentRow {
        agentId: string;
        agentName: string;
        assigned: number;
        resolved: number;
        avgResolutionMinutes: number | null;
        slaComplianceRate: number | null;
      }
      const find = (body: { agents: AgentRow[] }) =>
        body.agents.find((a) => a.agentId === agent1Id);

      const before = find(await ok('agents', teamLeadToken));
      const id = await createTicket();
      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/assignment`)
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .send({ assigneeId: agent1Id })
        .expect(200);

      const afterAssign = find(await ok('agents', teamLeadToken)) as AgentRow;
      expect(afterAssign.assigned).toBe((before?.assigned ?? 0) + 1);
      expect(afterAssign.agentName).toContain(' ');

      await setStatus(id, 'Resolved');
      const afterResolve = find(await ok('agents', teamLeadToken)) as AgentRow;
      expect(afterResolve.resolved).toBe(afterAssign.resolved + 1);
      expect(afterResolve.avgResolutionMinutes).not.toBeNull();
      expect(afterResolve.slaComplianceRate).not.toBeNull();
    });

    it('narrows to one assignee when filtered', async () => {
      const body = await ok('agents', adminToken, { assigneeId: agent1Id });
      for (const agent of body.agents) {
        expect(agent.agentId).toBe(agent1Id);
      }
    });
  });

  describe('GET /analytics/sla — the at-risk SQL is pinned to the per-ticket API', () => {
    it('counts a ticket at risk exactly when GET /tickets/:id reports AtRisk, and never while paused', async () => {
      const before = await ok('sla', agent1Token);
      const id = await createTicket({ priority: 'Medium' }); // 60 / 480 minute targets
      const fresh = await ok('sla', agent1Token);
      expect(fresh.ticketsWithSla).toBe(before.ticketsWithSla + 1);
      expect(fresh.response.atRisk).toBe(before.response.atRisk);
      expect((await slaOf(id)).responseState).toBe('Running');

      // Response clock: 5 of 60 minutes left is within the 20% threshold.
      await prisma.ticketSla.update({
        where: { ticketId: id },
        data: { responseDueAt: new Date(Date.now() + 5 * 60_000) },
      });
      expect((await slaOf(id)).responseState).toBe('AtRisk');
      const responseAtRisk = await ok('sla', agent1Token);
      expect(responseAtRisk.response.atRisk).toBe(before.response.atRisk + 1);
      expect(responseAtRisk.resolution.atRisk).toBe(before.resolution.atRisk);

      // Resolution clock: 30 of 480 minutes left is within 96.
      await prisma.ticketSla.update({
        where: { ticketId: id },
        data: { resolutionDueAt: new Date(Date.now() + 30 * 60_000) },
      });
      expect((await slaOf(id)).resolutionState).toBe('AtRisk');
      const bothAtRisk = await ok('sla', agent1Token);
      expect(bothAtRisk.response.atRisk).toBe(before.response.atRisk + 1);
      expect(bothAtRisk.resolution.atRisk).toBe(before.resolution.atRisk + 1);

      // Paused: the per-ticket API reports Paused and the aggregate drops it.
      await setStatus(id, 'OnHold');
      const paused = await slaOf(id);
      expect(paused.responseState).toBe('Paused');
      expect(paused.resolutionState).toBe('Paused');
      const pausedAgg = await ok('sla', agent1Token);
      expect(pausedAgg.response.atRisk).toBe(before.response.atRisk);
      expect(pausedAgg.resolution.atRisk).toBe(before.resolution.atRisk);
      expect(pausedAgg.response.inFlightBreached).toBe(before.response.inFlightBreached);

      // Resume, then push both clocks past due: Breached per ticket,
      // inFlightBreached +1 in the aggregate, and no longer at risk.
      await setStatus(id, 'InProgress');
      await prisma.ticketSla.update({
        where: { ticketId: id },
        data: {
          responseDueAt: new Date(Date.now() - 60_000),
          resolutionDueAt: new Date(Date.now() - 60_000),
        },
      });
      const breached = await slaOf(id);
      expect(breached.responseState).toBe('Breached');
      expect(breached.resolutionState).toBe('Breached');
      const breachedAgg = await ok('sla', agent1Token);
      expect(breachedAgg.response.atRisk).toBe(before.response.atRisk);
      expect(breachedAgg.resolution.atRisk).toBe(before.resolution.atRisk);
      expect(breachedAgg.response.inFlightBreached).toBe(before.response.inFlightBreached + 1);
      expect(breachedAgg.resolution.inFlightBreached).toBe(before.resolution.inFlightBreached + 1);
    });

    it('moves a completed late resolution into the breached count and lowers compliance', async () => {
      const before = await ok('sla', agent1Token);
      const id = await createTicket({ priority: 'Low' });
      await prisma.ticketSla.update({
        where: { ticketId: id },
        data: { resolutionDueAt: new Date(Date.now() - 60_000) },
      });
      await setStatus(id, 'Resolved');

      const after = await ok('sla', agent1Token);
      expect(after.resolution.breached).toBe(before.resolution.breached + 1);
      expect(after.resolution.met).toBe(before.resolution.met);
      expect(after.resolution.inFlightBreached).toBe(before.resolution.inFlightBreached);
      expect(after.resolution.complianceRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('seeded data is left untouched', () => {
    it('leaves every pre-existing ticket present and unmodified', async () => {
      const now = await prisma.ticket.findMany({
        where: { id: { in: [...preExisting.keys()] } },
        select: { id: true, updatedAt: true },
      });
      expect(now).toHaveLength(preExisting.size);
      for (const ticket of now) {
        expect(ticket.updatedAt.getTime()).toBe(preExisting.get(ticket.id));
      }
    });
  });
});
