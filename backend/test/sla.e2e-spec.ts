import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = 'DevPassword123!';
const MARKER = `e2e-sla-${Date.now()}`;

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

describe('SLA (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hardwareCategoryId: string;

  let adminToken: string;
  let agent1Token: string;
  let employee1Token: string;

  const createdTicketIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    adminToken = await loginAs(app, 'admin@opsnow.local');
    agent1Token = await loginAs(app, 'agent1@opsnow.local');
    employee1Token = await loginAs(app, 'employee1@opsnow.local');

    const categoriesRes = await request(app.getHttpServer())
      .get('/api/v1/ticket-categories')
      .set('Authorization', `Bearer ${employee1Token}`);
    hardwareCategoryId = categoriesRes.body.find(
      (c: { name: string; id: string }) => c.name === 'Hardware',
    ).id;
  });

  afterAll(async () => {
    // Clean up everything this suite created so the seeded dev data (5
    // Phase-2-seeded tickets, 4 SLA policies) stays untouched.
    if (createdTicketIds.length > 0) {
      await prisma.ticketHistory.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticketComment.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticketSla.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    await app.close();
  });

  async function createTicket(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: `${MARKER} ticket`,
        description: 'A test ticket created by the SLA e2e suite.',
        categoryId: hardwareCategoryId,
        ...overrides,
      });
    if (response.status === 201) {
      createdTicketIds.push(response.body.id);
    }
    return response;
  }

  async function getTicket(token: string, id: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/tickets/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  describe('GET /sla-policies', () => {
    it('rejects with no token', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/sla-policies',
      );
      expect(response.status).toBe(401);
    });

    it('rejects a non-staff caller', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sla-policies')
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(403);
    });

    it('returns the seeded, active, one-per-priority policies for staff', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sla-policies')
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      const byPriority = Object.fromEntries(
        response.body.map((p: { priority: string }) => [p.priority, p]),
      );
      expect(byPriority.Critical).toMatchObject({
        responseTimeMinutes: 15,
        resolutionTimeMinutes: 120,
        isActive: true,
      });
      expect(byPriority.High).toMatchObject({
        responseTimeMinutes: 30,
        resolutionTimeMinutes: 240,
      });
      expect(byPriority.Medium).toMatchObject({
        responseTimeMinutes: 60,
        resolutionTimeMinutes: 480,
      });
      expect(byPriority.Low).toMatchObject({
        responseTimeMinutes: 120,
        resolutionTimeMinutes: 1440,
      });
    });
  });

  describe('GET /sla/metrics', () => {
    it('rejects with no token', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/sla/metrics',
      );
      expect(response.status).toBe(401);
    });

    it('rejects a non-staff caller', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sla/metrics')
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(403);
    });

    it('returns typed counts for staff', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sla/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      for (const field of [
        'openWithSla',
        'resolutionBreachedInFlight',
        'resolutionBreachedCompleted',
        'respondedOnTime',
        'respondedLate',
        'responseOverdueOutstanding',
        'neverResponded',
      ]) {
        expect(typeof response.body[field]).toBe('number');
      }
    });
  });

  describe('SLA snapshot on ticket creation', () => {
    it('attaches an SLA snapshot matching the active policy for the ticket priority', async () => {
      const created = await createTicket(employee1Token, {
        priority: 'Critical',
      });

      expect(created.status).toBe(201);
      expect(created.body.sla).toMatchObject({
        responseTargetMinutes: 15,
        resolutionTargetMinutes: 120,
        responseAt: null,
        responseState: 'Running',
        resolutionState: 'Running',
        isPaused: false,
        totalPausedMinutes: 0,
      });
      expect(created.body.sla.responseMinutesRemaining).toBeLessThanOrEqual(15);
      expect(created.body.sla.resolutionMinutesRemaining).toBeLessThanOrEqual(120);
    });

    it('is visible on both GET /tickets/:id and the list endpoint', async () => {
      const created = await createTicket(employee1Token, { priority: 'High' });

      const single = await getTicket(employee1Token, created.body.id);
      expect(single.body.sla.responseTargetMinutes).toBe(30);

      const list = await request(app.getHttpServer())
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${employee1Token}`);
      const fromList = list.body.data.find(
        (t: { id: string }) => t.id === created.body.id,
      );
      expect(fromList.sla.resolutionTargetMinutes).toBe(240);
    });
  });

  describe('first response (ADR-020 D3)', () => {
    it('records the first qualifying staff Public reply as the response', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      const before = await getTicket(employee1Token, id);
      expect(before.body.sla.responseAt).toBeNull();

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'we are on it' })
        .expect(201);

      const after = await getTicket(employee1Token, id);
      expect(after.body.sla.responseAt).not.toBeNull();
      expect(after.body.sla.responseState).toBe('Met');
    });

    it('does not record a response for an Internal note', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'internal note', visibility: 'Internal' })
        .expect(201);

      const after = await getTicket(employee1Token, id);
      expect(after.body.sla.responseAt).toBeNull();
      expect(after.body.sla.responseState).toBe('Running');
    });

    it('does not record a response for the requester\'s own Public comment', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ body: 'following up on my own ticket' })
        .expect(201);

      const after = await getTicket(employee1Token, id);
      expect(after.body.sla.responseAt).toBeNull();
    });

    it('only records the FIRST qualifying reply — a second one never overwrites it', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'first reply' })
        .expect(201);
      const afterFirst = await getTicket(employee1Token, id);
      const firstResponseAt = afterFirst.body.sla.responseAt;

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ body: 'second reply' })
        .expect(201);
      const afterSecond = await getTicket(employee1Token, id);

      expect(afterSecond.body.sla.responseAt).toBe(firstResponseAt);
    });
  });

  describe('pause / resume across OnHold (ADR-020)', () => {
    it('pauses both clocks on OnHold and resumes with credited paused time on leaving it', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'OnHold' })
        .expect(200);

      const onHold = await getTicket(employee1Token, id);
      expect(onHold.body.sla.isPaused).toBe(true);
      expect(onHold.body.sla.responseState).toBe('Paused');
      expect(onHold.body.sla.resolutionState).toBe('Paused');

      await new Promise((resolve) => setTimeout(resolve, 1100));

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'InProgress' })
        .expect(200);

      const resumed = await getTicket(employee1Token, id);
      expect(resumed.body.sla.isPaused).toBe(false);
      expect(resumed.body.sla.responseState).not.toBe('Paused');
      expect(resumed.body.sla.totalPausedMinutes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resolution and reopen (ADR-020 D4)', () => {
    it('marks the resolution clock Met on an on-time resolution', async () => {
      const created = await createTicket(employee1Token, { priority: 'Low' });
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' })
        .expect(200);

      const resolved = await getTicket(employee1Token, id);
      expect(resolved.body.sla.resolutionState).toBe('Met');
    });

    it('credits the resolved-to-reopened interval as paused time on reopen, and resumes the clock', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' })
        .expect(200);
      const resolved = await getTicket(employee1Token, id);
      const pausedBeforeReopen = resolved.body.sla.totalPausedMinutes;

      await new Promise((resolve) => setTimeout(resolve, 1100));

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ status: 'Open' })
        .expect(200);

      const reopened = await getTicket(employee1Token, id);
      expect(reopened.body.sla.resolutionState).not.toBe('Met');
      expect(reopened.body.sla.isPaused).toBe(false);
      expect(reopened.body.sla.totalPausedMinutes).toBeGreaterThanOrEqual(
        pausedBeforeReopen,
      );
    });

    it('resuming out of OnHold straight into Resolved does not record a spurious breach', async () => {
      const created = await createTicket(employee1Token, { priority: 'Low' });
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'OnHold' })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const resolved = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' });

      expect(resolved.status).toBe(200);
      expect(resolved.body.sla.resolutionState).toBe('Met');
    });
  });

  describe('priority change (ADR-020)', () => {
    it('re-derives SLA targets and shifts the due dates when priority changes', async () => {
      const created = await createTicket(employee1Token, { priority: 'Medium' });
      const id = created.body.id;
      const before = await getTicket(employee1Token, id);
      expect(before.body.sla.responseTargetMinutes).toBe(60);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/priority`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ priority: 'Critical' });

      expect(response.status).toBe(200);
      expect(response.body.sla).toMatchObject({
        responseTargetMinutes: 15,
        resolutionTargetMinutes: 120,
      });
      expect(new Date(response.body.sla.responseDueAt).getTime()).toBeLessThan(
        new Date(before.body.sla.responseDueAt).getTime(),
      );
    });

    it('never double-applies the SLA delta when two priority changes race (CAS invariant)', async () => {
      const created = await createTicket(employee1Token, { priority: 'Medium' });
      const id = created.body.id;

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/tickets/${id}/priority`)
          .set('Authorization', `Bearer ${agent1Token}`)
          .send({ priority: 'Critical' }),
        request(app.getHttpServer())
          .patch(`/api/v1/tickets/${id}/priority`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ priority: 'Low' }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      const finalTicket = await getTicket(employee1Token, id);
      const finalPriority = finalTicket.body.priority as 'Critical' | 'Low';
      const expectedTargets =
        finalPriority === 'Critical'
          ? { responseTargetMinutes: 15, resolutionTargetMinutes: 120 }
          : { responseTargetMinutes: 120, resolutionTargetMinutes: 1440 };

      // Exactly the winning priority's targets are applied — never a
      // double-delta from both requests landing.
      expect(finalTicket.body.sla).toMatchObject(expectedTargets);
    });
  });
});
