import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

const SEED_PASSWORD = 'DevPassword123!';

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

describe('Ticket categories (e2e)', () => {
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

  it('rejects an unauthenticated request', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/ticket-categories',
    );
    expect(response.status).toBe(401);
  });

  it('returns the active category tree to any authenticated user', async () => {
    const token = await loginAs(app, 'employee1@opsnow.local');

    const response = await request(app.getHttpServer())
      .get('/api/v1/ticket-categories')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    for (const category of response.body) {
      expect(category.isActive).toBe(true);
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('name');
      expect(category).toHaveProperty('parentId');
    }
    expect(response.body.some((c: { name: string }) => c.name === 'Hardware')).toBe(
      true,
    );
    // A child category ("Laptop" is a child of "Hardware" in the seed).
    const laptop = response.body.find(
      (c: { name: string }) => c.name === 'Laptop',
    );
    expect(laptop?.parentId).not.toBeNull();
  });
});
