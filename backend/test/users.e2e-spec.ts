import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const SEED_PASSWORD = 'DevPassword123!';

async function loginAs(
  app: INestApplication,
  email: string,
): Promise<string> {
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

describe('Users RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects GET /users with no token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/users');
    expect(response.status).toBe(401);
  });

  it('allows an Administrator to list users, without leaking passwordHash', async () => {
    const token = await loginAs(app, 'admin@opsnow.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.total).toBeGreaterThanOrEqual(
      response.body.data.length,
    );
    for (const user of response.body.data) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).toHaveProperty('role');
    }
  });

  it('respects limit/offset pagination', async () => {
    const token = await loginAs(app, 'admin@opsnow.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ limit: 1, offset: 0 })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it.each([
    ['limit=0', { limit: 0 }],
    ['limit=101 (over the max)', { limit: 101 }],
    ['limit=abc (non-numeric)', { limit: 'abc' }],
    ['offset=-1 (negative)', { offset: -1 }],
    ['an unknown query param', { foo: 'bar' }],
  ])('rejects an invalid query (%s) with 400', async (_label, query) => {
    const token = await loginAs(app, 'admin@opsnow.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query(query)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it.each([
    ['TeamLead', 'teamlead@opsnow.local'],
    ['SupportAgent', 'agent1@opsnow.local'],
    ['Employee', 'employee1@opsnow.local'],
  ])(
    'rejects a %s from listing users (403)',
    async (_role, email) => {
      const token = await loginAs(app, email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    },
  );

  it('leaves non-role-restricted authenticated routes (e.g. /auth/me) unaffected', async () => {
    const token = await loginAs(app, 'employee1@opsnow.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email: 'employee1@opsnow.local' });
  });
});
