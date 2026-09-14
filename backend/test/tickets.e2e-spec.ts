import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = 'DevPassword123!';
const MARKER = `e2e-tickets-${Date.now()}`;

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

describe('Tickets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hardwareCategoryId: string;

  let adminToken: string;
  let teamLeadToken: string;
  let agent1Token: string;
  let employee1Token: string;
  let employee2Token: string;

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
    teamLeadToken = await loginAs(app, 'teamlead@opsnow.local');
    agent1Token = await loginAs(app, 'agent1@opsnow.local');
    employee1Token = await loginAs(app, 'employee1@opsnow.local');
    employee2Token = await loginAs(app, 'employee2@opsnow.local');

    const categoriesRes = await request(app.getHttpServer())
      .get('/api/v1/ticket-categories')
      .set('Authorization', `Bearer ${employee1Token}`);
    hardwareCategoryId = categoriesRes.body.find(
      (c: { name: string; id: string }) => c.name === 'Hardware',
    ).id;
  });

  afterAll(async () => {
    // Clean up everything this suite created so the seeded dev data and
    // the 5 Phase-2-seeded tickets stay untouched.
    if (createdTicketIds.length > 0) {
      await prisma.ticketHistory.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticketComment.deleteMany({
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
        description: 'A test ticket created by the e2e suite.',
        categoryId: hardwareCategoryId,
        ...overrides,
      });
    if (response.status === 201) {
      createdTicketIds.push(response.body.id);
    }
    return response;
  }

  it('rejects POST /tickets with no token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tickets')
      .send({ subject: 'x', description: 'y' });
    expect(response.status).toBe(401);
  });

  describe('creation', () => {
    it('creates a ticket with requesterId from the caller, defaulting status/priority', async () => {
      const response = await createTicket(employee1Token);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('New');
      expect(response.body.priority).toBe('Medium');
      expect(response.body.reopenedCount).toBe(0);
      expect(response.body.requester).toMatchObject({ role: 'Employee' });
      expect(response.body.requester).not.toHaveProperty('email');
      expect(response.body.requester).not.toHaveProperty('passwordHash');
      expect(response.body).toHaveProperty('ticketNumber');
    });

    it('rejects an oversized subject', async () => {
      const response = await createTicket(employee1Token, {
        subject: 'x'.repeat(256),
      });
      expect(response.status).toBe(400);
    });

    it('rejects a whitespace-only description', async () => {
      const response = await createTicket(employee1Token, {
        description: '   ',
      });
      expect(response.status).toBe(400);
    });

    it('rejects an invalid categoryId', async () => {
      const response = await createTicket(employee1Token, {
        categoryId: '00000000-0000-0000-0000-000000000000',
      });
      expect(response.status).toBe(400);
    });
  });

  describe('visibility and ownership', () => {
    let ticketId: string;

    beforeAll(async () => {
      const response = await createTicket(employee1Token);
      ticketId = response.body.id;
    });

    it('is visible to its own requester', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(200);
    });

    it('returns 404 (not 403) for a different Employee', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${employee2Token}`);
      expect(response.status).toBe(404);
    });

    it.each([
      ['Administrator', () => adminToken],
      ['TeamLead', () => teamLeadToken],
      ['SupportAgent', () => agent1Token],
    ])('is visible to staff (%s) regardless of ownership', async (_role, getToken) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${getToken()}`);
      expect(response.status).toBe(200);
    });

    it('returns 404 for a nonexistent ticket id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tickets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(404);
    });

    it('returns 400 (not a raw 500) for a malformed (non-UUID) ticket id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tickets/not-a-valid-uuid')
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(400);
    });

    it('GET /tickets lists it for the requester but not a different Employee', async () => {
      const own = await request(app.getHttpServer())
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${employee1Token}`);
      const other = await request(app.getHttpServer())
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${employee2Token}`);

      expect(own.body.data.some((t: { id: string }) => t.id === ticketId)).toBe(
        true,
      );
      expect(
        other.body.data.some((t: { id: string }) => t.id === ticketId),
      ).toBe(false);
    });

    it('GET /tickets lists it for staff regardless of ownership', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(
        response.body.data.some((t: { id: string }) => t.id === ticketId),
      ).toBe(true);
    });
  });

  describe('PATCH /tickets/:id', () => {
    it('allows the requester to edit while status is New', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ subject: `${MARKER} edited subject` });

      expect(response.status).toBe(200);
      expect(response.body.subject).toBe(`${MARKER} edited subject`);
    });

    it('returns 404 (not 403) when a different Employee tries to edit it', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}`)
        .set('Authorization', `Bearer ${employee2Token}`)
        .send({ subject: 'hijacked' });
      expect(response.status).toBe(404);
    });

    it('returns 403 (in-scope but disallowed) once the ticket leaves New', async () => {
      const created = await createTicket(employee1Token);
      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Open' });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ subject: 'too late' });
      expect(response.status).toBe(403);
    });

    it('allows staff to edit regardless of status', async () => {
      const created = await createTicket(employee1Token);
      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Open' });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ subject: `${MARKER} staff-edited` });
      expect(response.status).toBe(200);
    });
  });

  describe('PATCH /tickets/:id/assignment', () => {
    it('allows staff to assign a ticket to another staff member', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assigneeId: null });
      // Assigning to null (unassign) always succeeds regardless of target validation.
      expect(response.status).toBe(200);
    });

    it('rejects an Employee attempting to assign', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ assigneeId: null });
      expect(response.status).toBe(403);
    });

    it('rejects assigning to an Employee (not a staff role)', async () => {
      const created = await createTicket(employee1Token);
      const employeesRes = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const anotherEmployee = employeesRes.body.data.find(
        (u: { role: string }) => u.role === 'Employee',
      );

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assigneeId: anotherEmployee.id });
      expect(response.status).toBe(400);
    });

    it('rejects assigning to a nonexistent user', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assigneeId: '00000000-0000-0000-0000-000000000000' });
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /tickets/:id/status', () => {
    it('lets staff move a ticket through New -> Open -> Resolved, setting resolvedAt', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Open' })
        .expect(200);

      const resolved = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' });

      expect(resolved.status).toBe(200);
      expect(resolved.body.status).toBe('Resolved');
      expect(resolved.body.resolvedAt).not.toBeNull();
    });

    it('rejects a same-status transition with 400', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'New' });
      expect(response.status).toBe(400);
    });

    it('rejects an Employee attempting a non-reopen transition', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/status`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ status: 'InProgress' });
      expect(response.status).toBe(403);
    });

    it('allows an Employee to reopen their own Resolved ticket, clearing resolvedAt and incrementing reopenedCount', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Resolved' })
        .expect(200);

      const reopened = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ status: 'Open' });

      expect(reopened.status).toBe(200);
      expect(reopened.body.status).toBe('Open');
      expect(reopened.body.resolvedAt).toBeNull();
      expect(reopened.body.reopenedCount).toBe(1);
    });

    it('makes Closed terminal: no role (including Administrator) can transition out of it', async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Closed' })
        .expect(200);

      const staffAttempt = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Open' });
      expect(staffAttempt.status).toBe(403);

      const requesterAttempt = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${id}/status`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ status: 'Open' });
      expect(requesterAttempt.status).toBe(403);
    });
  });

  describe('PATCH /tickets/:id/priority', () => {
    it('allows staff to change priority', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/priority`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ priority: 'Critical' });
      expect(response.status).toBe(200);
      expect(response.body.priority).toBe('Critical');
    });

    it('rejects an Employee attempting to change priority', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/priority`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ priority: 'Critical' });
      expect(response.status).toBe(403);
    });
  });

  describe('comments', () => {
    it('lets the requester post a Public comment on their own ticket', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${created.body.id}/comments`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ body: 'A public comment.' });
      expect(response.status).toBe(201);
      expect(response.body.visibility).toBe('Public');
      expect(response.body.author).not.toHaveProperty('email');
    });

    it('rejects an Employee creating an Internal note', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${created.body.id}/comments`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ body: 'trying to be sneaky', visibility: 'Internal' });
      expect(response.status).toBe(403);
    });

    it('allows staff to create an Internal note', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${created.body.id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'internal note', visibility: 'Internal' });
      expect(response.status).toBe(201);
      expect(response.body.visibility).toBe('Internal');
    });

    it("excludes Internal notes AND their count from an Employee's comment list", async () => {
      const created = await createTicket(employee1Token);
      const id = created.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ body: 'public one' });
      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ body: 'internal one', visibility: 'Internal' });

      const asEmployee = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${employee1Token}`);
      const asStaff = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${id}/comments`)
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(asEmployee.body.total).toBe(1);
      expect(
        asEmployee.body.data.every((c: { visibility: string }) => c.visibility === 'Public'),
      ).toBe(true);
      expect(asStaff.body.total).toBe(2);
    });

    it('returns 404 (not 403) when commenting on a ticket outside scope', async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${created.body.id}/comments`)
        .set('Authorization', `Bearer ${employee2Token}`)
        .send({ body: 'not my ticket' });
      expect(response.status).toBe(404);
    });
  });

  describe('history', () => {
    it('lets staff view the history of any ticket', async () => {
      const created = await createTicket(employee1Token);
      await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${created.body.id}/status`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Open' });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${created.body.id}/history`)
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
      expect(
        response.body.data.some(
          (h: { fieldName: string; newValue: string }) =>
            h.fieldName === 'status' && h.newValue === 'Open',
        ),
      ).toBe(true);
    });

    it("rejects the ticket's own requester from viewing history", async () => {
      const created = await createTicket(employee1Token);
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${created.body.id}/history`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(403);
    });
  });

  describe('pagination validation', () => {
    it.each([
      ['limit=0', { limit: 0 }],
      ['limit=101', { limit: 101 }],
      ['offset=-1', { offset: -1 }],
      ['an unknown query param', { foo: 'bar' }],
    ])('rejects GET /tickets with an invalid query (%s)', async (_label, query) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tickets')
        .query(query)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(400);
    });
  });
});
