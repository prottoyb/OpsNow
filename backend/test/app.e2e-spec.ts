import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Health (e2e)', () => {
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

  it('GET /api/v1/health reports database status', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('info');
  });

  it('GET /api/v1/health/live answers 200 and is unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/health/live',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/does-not-exist returns a structured 404', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/does-not-exist',
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/api/v1/does-not-exist',
    });
    expect(response.body).toHaveProperty('timestamp');
  });
});
