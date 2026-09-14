import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

function extractRefreshCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'] as unknown as
    | string[]
    | undefined;
  const refreshCookie = setCookie?.find((cookie) =>
    cookie.startsWith('refresh_token='),
  );
  if (!refreshCookie) {
    throw new Error('refresh_token cookie was not set on the response');
  }
  return refreshCookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-auth-${Date.now()}@opsnow.local`;
  const testPassword = 'S3curePassword1';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up everything this suite created so the seeded dev data
    // (the 7 @opsnow.local accounts from Phase 2) stays untouched.
    const user = await prisma.user.findFirst({ where: { email: testEmail } });
    if (user) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it('rejects a protected route with no token', async () => {
    const response = await request(app.getHttpServer()).get(
      '/api/v1/auth/me',
    );
    expect(response.status).toBe(401);
  });

  it('rejects a protected route with a malformed token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(response.status).toBe(401);
  });

  it('leaves /api/v1/health reachable without a token', async () => {
    // Swagger (/api/docs) is only mounted in main.ts's real bootstrap,
    // not in the shared configureApp() this test harness uses — it is
    // verified reachable against the real running server instead (see
    // the Phase 4 completion report's manual verification).
    const health = await request(app.getHttpServer()).get('/api/v1/health');
    expect([200, 503]).toContain(health.status);
  });

  it('rejects registration with an invalid password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `bad-password-${Date.now()}@opsnow.local`,
        password: 'short',
        firstName: 'A',
        lastName: 'B',
      });
    expect(response.status).toBe(400);
  });

  it('registers a new user without leaking the password hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        firstName: 'E2E',
        lastName: 'Tester',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      email: testEmail,
      firstName: 'E2E',
      lastName: 'Tester',
    });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate registration with 409', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        firstName: 'E2E',
        lastName: 'Tester',
      });
    expect(response.status).toBe(409);
  });

  it('rejects login with the wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'totally-wrong-password' });
    expect(response.status).toBe(401);
  });

  it('runs the full login -> me -> refresh -> logout flow', async () => {
    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toHaveProperty('accessToken');
    const setCookie = (loginResponse.headers['set-cookie'] as unknown as
      | string[]
      | undefined) ?? [];
    expect(setCookie[0]).toContain('refresh_token=');
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).toContain('SameSite=Strict');

    const accessToken = loginResponse.body.accessToken as string;
    const originalRefreshCookie = extractRefreshCookie(loginResponse);

    const meResponse = await agent
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toMatchObject({ email: testEmail });

    const refreshResponse = await agent.post('/api/v1/auth/refresh');
    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body).toHaveProperty('accessToken');
    // The refresh token itself (random, DB-tracked) is guaranteed to
    // rotate; the access token is a plain signed JWT and can be
    // byte-identical to the previous one if issued within the same
    // second (same claims + iat), which is expected and harmless.
    expect(extractRefreshCookie(refreshResponse)).not.toBe(
      originalRefreshCookie,
    );

    const logoutResponse = await agent.post('/api/v1/auth/logout');
    expect(logoutResponse.status).toBe(204);

    const refreshAfterLogout = await agent.post('/api/v1/auth/refresh');
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('detects refresh-token reuse and revokes the whole token family', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    const originalCookie = extractRefreshCookie(loginResponse);

    const firstRefresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie);
    expect(firstRefresh.status).toBe(200);
    const rotatedCookie = extractRefreshCookie(firstRefresh);

    // Replay the now-superseded cookie: rejected, and should revoke the
    // legitimately-rotated token too (whole-family revocation).
    const reuseAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie);
    expect(reuseAttempt.status).toBe(401);

    const legitimateFollowUp = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', rotatedCookie);
    expect(legitimateFollowUp.status).toBe(401);
  });

  it('rejects refresh for an otherwise-valid token once its user is deactivated', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    const cookie = extractRefreshCookie(loginResponse);

    await prisma.user.update({
      where: { email: testEmail },
      data: { isActive: false },
    });

    try {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);
      expect(response.status).toBe(401);
    } finally {
      // Restore so later tests (and a fresh login) keep working.
      await prisma.user.update({
        where: { email: testEmail },
        data: { isActive: true },
      });
    }
  });

  it('rejects /auth/refresh when the Origin header is cross-site', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    const cookie = extractRefreshCookie(loginResponse);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(403);
  });
});
