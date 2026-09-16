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

    async function getMetrics() {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sla/metrics')
        .set('Authorization', `Bearer ${adminToken}`);
      return response.body as Record<string, number>;
    }

    it('increments openWithSla for a newly-created open ticket, and respondedOnTime once a staff reply lands (behavioral, not just typed)', async () => {
      const before = await getMetrics();

      const created = await createTicket(employee1Token, { priority: 'Low' });
      const id = created.body.id;
      const afterCreate = await getMetrics();
      expect(afterCreate.openWithSla).toBe(before.openWithSla + 1);

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'on it' })
        .expect(201);
      const afterReply = await getMetrics();
      expect(afterReply.respondedOnTime).toBe(afterCreate.respondedOnTime + 1);
      expect(afterReply.respondedLate).toBe(afterCreate.respondedLate);
    });

    it('increments neverResponded when a ticket resolves without ever getting a qualifying reply, and moves it out of openWithSla', async () => {
      const created = await createTicket(employee1Token, { priority: 'Low' });
      const id = created.body.id;
      const afterCreate = await getMetrics();

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' })
        .expect(200);

      const afterResolve = await getMetrics();
      expect(afterResolve.neverResponded).toBe(afterCreate.neverResponded + 1);
      expect(afterResolve.openWithSla).toBe(afterCreate.openWithSla - 1);
    });

    it('does not double-count a reopened ticket in resolutionBreachedCompleted once its resolution is undone (M1 regression, observed through the aggregate)', async () => {
      const created = await createTicket(employee1Token, { priority: 'Low' });
      const id = created.body.id;
      const before = await getMetrics();

      // Force a genuine breach deterministically (rather than waiting out
      // a real 24h Low-priority target): backdate the resolution due date
      // into the past so resolving "now" is unambiguously late.
      await prisma.ticketSla.updateMany({
        where: { ticketId: id },
        data: { resolutionDueAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' })
        .expect(200);
      const afterResolve = await getMetrics();
      expect(afterResolve.resolutionBreachedCompleted).toBe(
        before.resolutionBreachedCompleted + 1,
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ status: 'Open' })
        .expect(200);
      const afterReopen = await getMetrics();

      // The M1 assertion: reopening must remove this ticket from the
      // "completed and breached" aggregate — it is no longer completed at
      // all. Before the fix, resolution_breached stayed stale-true and
      // this count never dropped back down.
      expect(afterReopen.resolutionBreachedCompleted).toBe(
        before.resolutionBreachedCompleted,
      );
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
    it('pauses both clocks on OnHold, and shifts both due dates forward by the elapsed hold on resume', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;
      const beforeHold = created.body.sla;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'OnHold' })
        .expect(200);

      const onHold = await getTicket(employee1Token, id);
      expect(onHold.body.sla.isPaused).toBe(true);
      expect(onHold.body.sla.responseState).toBe('Paused');
      expect(onHold.body.sla.resolutionState).toBe('Paused');
      // Frozen, not shifted, while still paused.
      expect(onHold.body.sla.responseDueAt).toBe(beforeHold.responseDueAt);
      expect(onHold.body.sla.resolutionDueAt).toBe(beforeHold.resolutionDueAt);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'InProgress' })
        .expect(200);

      const resumed = await getTicket(employee1Token, id);
      expect(resumed.body.sla.isPaused).toBe(false);
      expect(resumed.body.sla.responseState).not.toBe('Paused');
      // The real, sensitive assertion: resume must have actually shifted
      // both due dates forward, not just flipped isPaused off (M5 fix —
      // the previous version of this test could not fail if the shift
      // were silently removed).
      expect(new Date(resumed.body.sla.responseDueAt).getTime()).toBeGreaterThan(
        new Date(beforeHold.responseDueAt).getTime(),
      );
      expect(new Date(resumed.body.sla.resolutionDueAt).getTime()).toBeGreaterThan(
        new Date(beforeHold.resolutionDueAt).getTime(),
      );
    });
  });

  describe('first response recorded while paused (ADR-020 H1 fix)', () => {
    async function backdateSla(
      ticketId: string,
      overrides: { responseDueAt: Date; onHoldStartedAt: Date },
    ) {
      await prisma.ticketSla.updateMany({
        where: { ticketId },
        data: overrides,
      });
    }

    it('does NOT mark a reply breached when the hold started BEFORE the (now-passed) due date', async () => {
      const created = await createTicket(employee1Token, { priority: 'Critical' });
      const id = created.body.id;
      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'OnHold' })
        .expect(200);

      const now = Date.now();
      await backdateSla(id, {
        responseDueAt: new Date(now - 2 * 60_000), // due 2 min ago
        onHoldStartedAt: new Date(now - 10 * 60_000), // paused 10 min ago — BEFORE it went overdue
      });

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'replying while on hold' })
        .expect(201);

      const after = await getTicket(employee1Token, id);
      expect(after.body.sla.responseAt).not.toBeNull();
      expect(after.body.sla.responseState).toBe('Met');
    });

    it('DOES mark a reply breached when the ticket was already overdue BEFORE it was paused', async () => {
      const created = await createTicket(employee1Token, { priority: 'Critical' });
      const id = created.body.id;
      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'OnHold' })
        .expect(200);

      const now = Date.now();
      await backdateSla(id, {
        responseDueAt: new Date(now - 10 * 60_000), // due 10 min ago
        onHoldStartedAt: new Date(now - 1 * 60_000), // paused only 1 min ago — AFTER it went overdue
      });

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'replying too late' })
        .expect(201);

      const after = await getTicket(employee1Token, id);
      expect(after.body.sla.responseState).toBe('Breached');
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

    it('credits the resolved-to-reopened interval as paused time on reopen, resumes the clock, and clears the stale resolution-breached flag (M1 fix)', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;
      const beforeResolve = created.body.sla;

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
      // The real, sensitive assertion for the reopen credit itself (M5
      // fix): the resolution due date must have moved forward from what
      // it was before the resolve/reopen cycle.
      expect(new Date(reopened.body.sla.resolutionDueAt).getTime()).toBeGreaterThan(
        new Date(beforeResolve.resolutionDueAt).getTime(),
      );

      // M1 fix: resolution_breached must not remain stale-`true` from the
      // undone resolution — getMetrics' resolutionBreachedCompleted
      // aggregate reads this column directly and would double-count an
      // unresolved ticket otherwise. Checked directly against the DB
      // since the per-ticket read model already derives state from
      // resolvedAt (masking a stale flag) — this is exactly the gap a
      // future aggregate consumer could fall into.
      const row = await prisma.ticketSla.findUniqueOrThrow({ where: { ticketId: id } });
      expect(row.resolutionBreached).toBe(false);
    });

    it('resuming out of OnHold straight into Resolved shifts the due date BEFORE recording the outcome, so it does not record a spurious breach (M3 fix)', async () => {
      const created = await createTicket(employee1Token, { priority: 'Low' });
      const id = created.body.id;
      const beforeHold = created.body.sla;

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
      // The sensitive assertion (M3 fix): resolutionDueAt must have moved
      // forward by the hold duration — proving resumeFromPause's shift
      // actually ran before recordResolutionOutcome's breach check, not
      // just that a huge (Low-priority, 24h) target papered over the
      // ordering bug. Deleting the resumeFromPause call would leave this
      // due date unchanged and fail this assertion.
      expect(new Date(resolved.body.sla.resolutionDueAt).getTime()).toBeGreaterThan(
        new Date(beforeHold.resolutionDueAt).getTime(),
      );
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

    it('never corrupts the SLA due-date arithmetic when two priority changes race, and every successful change gets exactly one history row (CAS invariant)', async () => {
      const created = await createTicket(employee1Token, { priority: 'Medium' });
      const id = created.body.id;
      const original = created.body.sla;

      // Two concurrent requests against the real HTTP server can legitimately
      // resolve either as a true race (one 409s) or as two sequential CAS
      // successes (Node/network scheduling interleaves the pre-transaction
      // reads before either write commits) — both are correct outcomes of
      // optimistic concurrency, so asserting one fixed status tuple here
      // would be flaky by construction. What must ALWAYS hold, regardless
      // of interleaving, is: no status other than 200/409, and the final
      // state is arithmetically consistent with a clean sequence of deltas
      // from the original snapshot (never a corrupted/doubled shift).
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

      const statuses = [first.status, second.status];
      expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
      const successCount = statuses.filter((s) => s === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      const finalTicket = await getTicket(employee1Token, id);
      const finalPriority = finalTicket.body.priority as 'Critical' | 'Low';
      const targetsByPriority: Record<string, { responseTargetMinutes: number; resolutionTargetMinutes: number }> = {
        Critical: { responseTargetMinutes: 15, resolutionTargetMinutes: 120 },
        Low: { responseTargetMinutes: 120, resolutionTargetMinutes: 1440 },
      };
      const expectedTargets = targetsByPriority[finalPriority];
      expect(finalTicket.body.sla).toMatchObject(expectedTargets);

      // Due-date arithmetic: whatever sequence of deltas actually applied,
      // the commutative-delta invariant (ADR-020, proven in
      // sla.calculations.spec.ts) means the final due date must equal the
      // ORIGINAL due date shifted by exactly (finalTarget - originalTarget)
      // — never more, never less, regardless of how many requests
      // succeeded or in what order. This is the assertion a double-applied
      // or lost delta would actually fail.
      const responseDeltaMs =
        (expectedTargets.responseTargetMinutes - original.responseTargetMinutes) * 60_000;
      const resolutionDeltaMs =
        (expectedTargets.resolutionTargetMinutes - original.resolutionTargetMinutes) * 60_000;
      expect(new Date(finalTicket.body.sla.responseDueAt).getTime()).toBe(
        new Date(original.responseDueAt).getTime() + responseDeltaMs,
      );
      expect(new Date(finalTicket.body.sla.resolutionDueAt).getTime()).toBe(
        new Date(original.resolutionDueAt).getTime() + resolutionDeltaMs,
      );

      // The CAS's other real job (beyond the SLA row, which self-protects
      // via same-statement current-value reads): TicketHistory must never
      // record a lying oldValue from a request that actually lost the
      // race — exactly one history row per ACTUAL successful change, never
      // one for a 409.
      const history = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);
      const priorityHistoryRows = history.body.data.filter(
        (h: { fieldName: string }) => h.fieldName === 'priority',
      );
      expect(priorityHistoryRows).toHaveLength(successCount);
    });

    it('does not shift due dates on an already-resolved ticket\'s completed clock (M7 fix)', async () => {
      const created = await createTicket(employee1Token, { priority: 'Medium' });
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' })
        .expect(200);
      const beforePriorityChange = await getTicket(employee1Token, id);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/priority`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ priority: 'Critical' });

      // Phase 6a's priority-change behavior is unchanged: it still succeeds
      // even on a Resolved ticket.
      expect(response.status).toBe(200);
      expect(response.body.priority).toBe('Critical');
      // But the SLA snapshot is left completely untouched — no partial
      // shift, no target/due-date mismatch.
      expect(response.body.sla).toEqual(beforePriorityChange.body.sla);
    });
  });
});
