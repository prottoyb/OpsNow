import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

const SEED_PASSWORD = 'DevPassword123!';
// Every asset this suite creates carries this run-unique marker in its
// asset tag, so assertions can be scoped to this run's rows and the
// seeded dev data is never touched.
const MARKER = `E2E-${Date.now()}`;

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

describe('Assets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let agent1Token: string;
  let employee1Token: string;
  let employee2Token: string;

  let laptopTypeId: string;
  let employee1Id: string;
  let employee2Id: string;
  let employee2LastName: string;

  const createdAssetIds: string[] = [];
  const createdTicketIds: string[] = [];
  let tagCounter = 0;

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
    employee2Token = await loginAs(app, 'employee2@opsnow.local');

    const typesRes = await request(app.getHttpServer())
      .get('/api/v1/asset-types')
      .set('Authorization', `Bearer ${employee1Token}`);
    laptopTypeId = typesRes.body.find(
      (t: { name: string; id: string }) => t.name === 'Laptop',
    ).id;

    const usersRes = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${adminToken}`);
    const findUser = (email: string) =>
      usersRes.body.data.find((u: { email: string }) => u.email === email).id;
    employee1Id = findUser('employee1@opsnow.local');
    employee2Id = findUser('employee2@opsnow.local');
    // Read from the seed rather than hard-coded, so the leak assertions
    // below stay true if the seeded names change.
    employee2LastName = usersRes.body.data.find(
      (u: { email: string }) => u.email === 'employee2@opsnow.local',
    ).lastName;
  });

  afterAll(async () => {
    // Remove only what this run created, children first, so the seeded
    // dev data is exactly as it was before the suite ran.
    if (createdAssetIds.length > 0) {
      await prisma.assetAssignment.deleteMany({
        where: { assetId: { in: createdAssetIds } },
      });
      await prisma.ticketAsset.deleteMany({
        where: { assetId: { in: createdAssetIds } },
      });
    }
    if (createdTicketIds.length > 0) {
      await prisma.ticketAsset.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticketHistory.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticketComment.deleteMany({
        where: { ticketId: { in: createdTicketIds } },
      });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (createdAssetIds.length > 0) {
      await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
    }
    await app.close();
  });

  async function createAsset(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    tagCounter += 1;
    const response = await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetTag: `${MARKER}-${tagCounter}`,
        name: 'E2E Test Laptop',
        assetTypeId: laptopTypeId,
        ...overrides,
      });
    if (response.status === 201) {
      createdAssetIds.push(response.body.id);
    }
    return response;
  }

  async function createTicket(token: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: `${MARKER} asset-link ticket`,
        description: 'A ticket created by the assets e2e suite.',
      });
    if (response.status === 201) {
      createdTicketIds.push(response.body.id);
    }
    return response;
  }

  describe('GET /asset-types', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/asset-types',
      );
      expect(response.status).toBe(401);
    });

    it('returns the active types to any authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/asset-types')
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      for (const type of response.body) {
        expect(type.isActive).toBe(true);
        expect(type).toHaveProperty('id');
        expect(type).toHaveProperty('name');
      }
    });
  });

  describe('POST /assets', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/assets')
        .send({ assetTag: 'x', name: 'y', assetTypeId: laptopTypeId });
      expect(response.status).toBe(401);
    });

    it('creates an asset InStock and unassigned', async () => {
      const response = await createAsset(agent1Token);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('InStock');
      expect(response.body.currentAssignee).toBeNull();
      expect(response.body.assetType).toMatchObject({ name: 'Laptop' });
    });

    it('rejects an Employee attempting to create an asset', async () => {
      const response = await createAsset(employee1Token);
      expect(response.status).toBe(403);
    });

    it('rejects a duplicate assetTag with 409, not a 500', async () => {
      const first = await createAsset(agent1Token);
      const duplicate = await request(app.getHttpServer())
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({
          assetTag: first.body.assetTag,
          name: 'Duplicate tag',
          assetTypeId: laptopTypeId,
        });

      expect(duplicate.status).toBe(409);
      expect(JSON.stringify(duplicate.body)).not.toContain('prisma');
    });

    it('rejects an unknown assetTypeId', async () => {
      const response = await createAsset(agent1Token, {
        assetTypeId: '00000000-0000-0000-0000-000000000000',
      });
      expect(response.status).toBe(400);
    });

    it.each([
      ['assetTag', { assetTag: 'x'.repeat(51) }],
      ['name', { name: 'x'.repeat(151) }],
      ['serialNumber', { serialNumber: 'x'.repeat(101) }],
      ['notes', { notes: 'x'.repeat(5001) }],
    ])('rejects an oversized %s', async (_label, overrides) => {
      const response = await createAsset(agent1Token, overrides);
      expect(response.status).toBe(400);
    });

    it('rejects an unknown query/body field', async () => {
      const response = await createAsset(agent1Token, { status: 'Assigned' });
      expect(response.status).toBe(400);
    });
  });

  describe('visibility', () => {
    let assignedAssetId: string;
    let stockAssetId: string;

    beforeAll(async () => {
      const assigned = await createAsset(agent1Token);
      assignedAssetId = assigned.body.id;
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${assignedAssetId}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee1Id })
        .expect(200);

      const stock = await createAsset(agent1Token);
      stockAssetId = stock.body.id;
    });

    it('lets the holder see their own asset', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/assets/${assignedAssetId}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(200);
    });

    it('returns 404 (not 403) to an Employee who does not hold the asset', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/assets/${assignedAssetId}`)
        .set('Authorization', `Bearer ${employee2Token}`);
      expect(response.status).toBe(404);
    });

    it('returns 404 to an Employee for an unassigned asset', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/assets/${stockAssetId}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(404);
    });

    it('lets staff see any asset', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/assets/${stockAssetId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
    });

    it('returns 404 for a nonexistent asset id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/assets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(404);
    });

    it('returns 400 (not a raw 500) for a malformed asset id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/assets/not-a-uuid')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(400);
    });

    it('lists only the assets an Employee holds', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.every(
          (a: { currentAssignee: { id: string } | null }) =>
            a.currentAssignee?.id === employee1Id,
        ),
      ).toBe(true);
      expect(
        response.body.data.some((a: { id: string }) => a.id === assignedAssetId),
      ).toBe(true);
      expect(
        response.body.data.some((a: { id: string }) => a.id === stockAssetId),
      ).toBe(false);
    });

    it('does not let an Employee widen their scope with an assigneeId filter', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query({ assigneeId: employee2Id, limit: 100 })
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('lists every asset for staff and supports the free-text q filter', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query({ q: MARKER.toLowerCase(), limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      // Case-insensitive match against the (upper-case) marker in assetTag.
      expect(response.body.total).toBeGreaterThanOrEqual(2);
      expect(
        response.body.data.every((a: { assetTag: string }) =>
          a.assetTag.startsWith(MARKER),
        ),
      ).toBe(true);
    });

    it('filters by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query({ q: MARKER.toLowerCase(), status: 'Assigned', limit: 100 })
        .set('Authorization', `Bearer ${agent1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.every((a: { status: string }) => a.status === 'Assigned'),
      ).toBe(true);
    });

    it.each([
      ['limit=0', { limit: 0 }],
      ['limit=101', { limit: 101 }],
      ['offset=-1', { offset: -1 }],
      ['an unknown query param', { foo: 'bar' }],
    ])('rejects GET /assets with an invalid query (%s)', async (_label, query) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query(query)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /assets/:id', () => {
    it('lets staff edit the editable fields', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({
          name: 'Renamed by e2e',
          serialNumber: 'SN-E2E-1',
          notes: 'Checked in by the e2e suite.',
          purchaseDate: '2026-01-15',
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Renamed by e2e');
      expect(response.body.serialNumber).toBe('SN-E2E-1');
      expect(response.body.purchaseDate).not.toBeNull();
    });

    it('rejects an Employee attempting to edit', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ name: 'hijacked' });
      expect(response.status).toBe(403);
    });

    it('allows a non-assignment status change on an unassigned asset', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'InRepair' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('InRepair');
      expect(response.body.currentAssignee).toBeNull();
    });

    it('rejects setting status to Assigned through this route', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'Assigned' });
      expect(response.status).toBe(400);
    });

    it('rejects a status change on a currently-assigned asset', async () => {
      const created = await createAsset(agent1Token);
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee2Id })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ status: 'InRepair' });

      expect(response.status).toBe(400);
      // Status and assignee stayed in sync.
      const after = await request(app.getHttpServer())
        .get(`/api/v1/assets/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(after.body.status).toBe('Assigned');
      expect(after.body.currentAssignee.id).toBe(employee2Id);
    });

    it('rejects an unknown assetTypeId on update', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assetTypeId: '00000000-0000-0000-0000-000000000000' });
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /assets/:id/assignment', () => {
    it('assigns to an Employee, setting status and opening a ledger row', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee1Id, notes: 'Issued by e2e' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('Assigned');
      expect(response.body.currentAssignee.id).toBe(employee1Id);
      expect(response.body.currentAssignee).not.toHaveProperty('email');

      const history = await request(app.getHttpServer())
        .get(`/api/v1/assets/${created.body.id}/assignments`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(history.body.total).toBe(1);
      expect(history.body.data[0].returnedAt).toBeNull();
      expect(history.body.data[0].notes).toBe('Issued by e2e');
    });

    it('returns an asset to stock, closing the ledger row', async () => {
      const created = await createAsset(agent1Token);
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee1Id })
        .expect(200);

      const returned = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: null });

      expect(returned.status).toBe(200);
      expect(returned.body.status).toBe('InStock');
      expect(returned.body.currentAssignee).toBeNull();

      const history = await request(app.getHttpServer())
        .get(`/api/v1/assets/${created.body.id}/assignments`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(history.body.total).toBe(1);
      expect(history.body.data[0].returnedAt).not.toBeNull();
    });

    it('reassigns directly, closing the old ledger row and opening a new one', async () => {
      const created = await createAsset(agent1Token);
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee1Id })
        .expect(200);

      const reassigned = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee2Id });

      expect(reassigned.status).toBe(200);
      expect(reassigned.body.currentAssignee.id).toBe(employee2Id);

      const history = await request(app.getHttpServer())
        .get(`/api/v1/assets/${created.body.id}/assignments`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(history.body.total).toBe(2);
      const open = history.body.data.filter(
        (row: { returnedAt: string | null }) => row.returnedAt === null,
      );
      expect(open).toHaveLength(1);
      expect(open[0].assignedTo.id).toBe(employee2Id);
    });

    it('treats returning an already-unassigned asset as a no-op', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: null });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('InStock');

      const history = await request(app.getHttpServer())
        .get(`/api/v1/assets/${created.body.id}/assignments`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(history.body.total).toBe(0);
    });

    it.each(['InRepair', 'Retired', 'Lost'])(
      'rejects assigning an asset in status %s with 400',
      async (status) => {
        const created = await createAsset(agent1Token);
        await request(app.getHttpServer())
          .patch(`/api/v1/assets/${created.body.id}`)
          .set('Authorization', `Bearer ${agent1Token}`)
          .send({ status })
          .expect(200);

        const response = await request(app.getHttpServer())
          .patch(`/api/v1/assets/${created.body.id}/assignment`)
          .set('Authorization', `Bearer ${agent1Token}`)
          .send({ assignedToId: employee1Id });

        expect(response.status).toBe(400);
      },
    );

    it('rejects a nonexistent assignment target', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: '00000000-0000-0000-0000-000000000000' });
      expect(response.status).toBe(400);
    });

    it('rejects an Employee attempting to assign', async () => {
      const created = await createAsset(agent1Token);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ assignedToId: employee1Id });
      expect(response.status).toBe(403);
    });
  });

  describe('GET /assets/:id/assignments', () => {
    it('rejects an Employee, even for an asset they hold', async () => {
      const created = await createAsset(agent1Token);
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${created.body.id}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee1Id })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/assets/${created.body.id}/assignments`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(403);
    });

    it('returns 404 for a nonexistent asset', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/api/v1/assets/00000000-0000-0000-0000-000000000000/assignments',
        )
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(404);
    });
  });

  describe('ticket <-> asset links', () => {
    let ticketId: string;
    let assetId: string;

    beforeAll(async () => {
      const ticket = await createTicket(employee1Token);
      ticketId = ticket.body.id;
      const asset = await createAsset(agent1Token);
      assetId = asset.body.id;
    });

    it('rejects an Employee attempting to link', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${employee1Token}`)
        .send({ assetId });
      expect(response.status).toBe(403);
    });

    it('rejects linking an asset that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assetId: '00000000-0000-0000-0000-000000000000' });
      expect(response.status).toBe(400);
    });

    it('links an asset to a ticket', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assetId });

      expect(response.status).toBe(201);
      expect(response.body.asset.id).toBe(assetId);
      expect(response.body.linkedBy).not.toHaveProperty('email');
    });

    it('is idempotent: re-linking returns the existing link, not an error', async () => {
      const first = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${agent1Token}`);
      const linkedAt = first.body.find(
        (l: { asset: { id: string } }) => l.asset.id === assetId,
      ).linkedAt;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assetId });

      expect(response.status).toBe(201);
      expect(response.body.linkedAt).toBe(linkedAt);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(
        after.body.filter((l: { asset: { id: string } }) => l.asset.id === assetId),
      ).toHaveLength(1);
    });

    it("lets the ticket's own requester see the linked assets", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${employee1Token}`);

      expect(response.status).toBe(200);
      expect(
        response.body.some((l: { asset: { id: string } }) => l.asset.id === assetId),
      ).toBe(true);
    });

    it.each([
      [
        'GET',
        (server: unknown) =>
          request(server as never).get(`/api/v1/tickets/${ticketId}/assets`),
      ],
      [
        'POST',
        (server: unknown) =>
          request(server as never)
            .post(`/api/v1/tickets/${ticketId}/assets`)
            .send({ assetId }),
      ],
      [
        'DELETE',
        (server: unknown) =>
          request(server as never).delete(
            `/api/v1/tickets/${ticketId}/assets/${assetId}`,
          ),
      ],
    ])(
      'leaks nothing about a ticket outside the caller scope via %s',
      async (_method, buildRequest) => {
        const response = await buildRequest(app.getHttpServer()).set(
          'Authorization',
          `Bearer ${employee2Token}`,
        );
        // 404 for the readable route, 403 for the staff-only ones — in no
        // case does an out-of-scope caller learn that links exist.
        expect([403, 404]).toContain(response.status);

        // The error envelope echoes `path`, which for the DELETE route
        // necessarily contains the assetId the CALLER themselves put in the
        // URL. Echoing a caller's own input back is not disclosure, so the
        // leak check is applied to everything except that field.
        const { path: _echoedPath, ...informative } = response.body as Record<
          string,
          unknown
        >;
        expect(JSON.stringify(informative)).not.toContain(assetId);
        expect(JSON.stringify(informative)).not.toContain(ticketId);
        // Nothing link-shaped ever comes back for an out-of-scope ticket.
        expect(informative).not.toHaveProperty('asset');
        expect(informative).not.toHaveProperty('linkedAt');
      },
    );

    it('returns 404 when staff ask for a nonexistent ticket', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tickets/00000000-0000-0000-0000-000000000000/assets')
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(response.status).toBe(404);
    });

    it('unlinks with 204, and unlinking again is still 204', async () => {
      const first = await request(app.getHttpServer())
        .delete(`/api/v1/tickets/${ticketId}/assets/${assetId}`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(first.status).toBe(204);

      const second = await request(app.getHttpServer())
        .delete(`/api/v1/tickets/${ticketId}/assets/${assetId}`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(second.status).toBe(204);

      const links = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${agent1Token}`);
      expect(
        links.body.some((l: { asset: { id: string } }) => l.asset.id === assetId),
      ).toBe(false);
    });

    it('rejects an Employee attempting to unlink', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/tickets/${ticketId}/assets/${assetId}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(response.status).toBe(403);
    });
  });

  describe('GET /tickets/:id/assets projection', () => {
    // The ticket-link route does NO asset scoping of its own — it relies
    // entirely on ticket visibility. What keeps that safe is the uniform
    // AssetSummaryResponseDto projection: the fields GET /assets/:id
    // would 404 on for this caller are never in the payload at all.
    const SERIAL = 'SN-CONFIDENTIAL-8842';
    const NOTES = 'Internal handling note: liquid damage claim pending.';

    let ticketId: string;
    let assetId: string;

    beforeAll(async () => {
      const ticket = await createTicket(employee1Token);
      ticketId = ticket.body.id;

      const asset = await createAsset(agent1Token, {
        serialNumber: SERIAL,
        notes: NOTES,
      });
      assetId = asset.body.id;

      // Held by employee2 — a different employee from the requester.
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${assetId}/assignment`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assignedToId: employee2Id })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({ assetId })
        .expect(201);
    });

    it('confirms the requester cannot read the asset directly', async () => {
      const direct = await request(app.getHttpServer())
        .get(`/api/v1/assets/${assetId}`)
        .set('Authorization', `Bearer ${employee1Token}`);
      expect(direct.status).toBe(404);
    });

    it.each([
      ['the ticket requester', () => employee1Token],
      ['a staff caller (the projection is uniform)', () => agent1Token],
    ])('returns only the asset summary to %s', async (_label, token) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tickets/${ticketId}/assets`)
        .set('Authorization', `Bearer ${token()}`);

      expect(response.status).toBe(200);
      const link = response.body.find(
        (l: { asset: { id: string } }) => l.asset.id === assetId,
      );
      expect(link).toBeDefined();
      expect(Object.keys(link.asset).sort()).toEqual([
        'assetTag',
        'assetType',
        'id',
        'name',
        'status',
      ]);

      const payload = JSON.stringify(response.body);
      expect(payload).not.toContain(SERIAL);
      expect(payload).not.toContain(NOTES);
      expect(payload).not.toContain(employee2LastName);
    });
  });

  describe('concurrent assignment', () => {
    it('lets exactly one of two simultaneous assignments win, leaving one open ledger row', async () => {
      const created = await createAsset(agent1Token);
      const assetId = created.body.id;

      const patch = (assignedToId: string) =>
        request(app.getHttpServer())
          .patch(`/api/v1/assets/${assetId}/assignment`)
          .set('Authorization', `Bearer ${agent1Token}`)
          .send({ assignedToId });

      const [first, second] = await Promise.all([
        patch(employee1Id),
        patch(employee2Id),
      ]);

      // The CAS predicate is what decides this: the loser's updateMany
      // matches no row, so it is a 409 rather than a silent overwrite.
      expect([first.status, second.status].sort()).toEqual([200, 409]);

      const asset = await prisma.asset.findUniqueOrThrow({
        where: { id: assetId },
      });
      expect(asset.status).toBe('Assigned');

      const openRows = await prisma.assetAssignment.findMany({
        where: { assetId, returnedAt: null },
      });
      expect(openRows).toHaveLength(1);
      // The ledger and the asset agree about who holds it.
      expect(openRows[0].assignedToId).toBe(asset.currentAssigneeId);
    });
  });
});
