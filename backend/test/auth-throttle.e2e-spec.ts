import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Proves the auth brute-force throttle (ADR-026) actually fires.
 *
 * `test/support/jest-env.ts` raises AUTH_THROTTLE_LIMIT for every other
 * suite, because they authenticate several role accounts back to back and
 * would otherwise trip a production-sized limit. That raise is the reason
 * this suite has to exist: it boots its OWN application with a deliberately
 * tiny limit, so the control is verified by a test rather than assumed from
 * the guard being present in the source.
 *
 * `AppModule` is loaded with `await import()` inside `beforeAll`, NOT with a
 * top-level import, and that is load-bearing. `ConfigModule.forRoot()` runs
 * `validateEnv(process.env)` synchronously while `app.module.ts` is being
 * evaluated, so a top-level import would freeze the configuration before
 * this file could change it — the suite would silently run against the
 * inherited limit and pass for the wrong reason.
 *
 * Non-destructive, per the project's standing rule: it authenticates as
 * nobody (the email does not exist), creates no user, no ticket and no
 * session, and deletes only the failed-login audit rows its own requests
 * generated — identified by a User-Agent unique to this run, the same
 * technique audit.e2e-spec.ts uses.
 */
const LIMIT = 3;
const RUN_ID = `throttle-${Date.now()}`;
const UA = `opsnow-e2e-${RUN_ID}`;
const GHOST_EMAIL = `e2e-${RUN_ID}@opsnow.local`;

describe('Auth throttling (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previousLimit = process.env.AUTH_THROTTLE_LIMIT;
  const previousTtl = process.env.AUTH_THROTTLE_TTL_SECONDS;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = String(LIMIT);
    process.env.AUTH_THROTTLE_TTL_SECONDS = '60';

    const { AppModule } = await import('../src/app.module');
    const { configureApp } = await import('../src/configure-app');
    const { PrismaService: PrismaServiceClass } = await import(
      '../src/prisma/prisma.service'
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaServiceClass);
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({ where: { userAgent: UA } });
    } catch {
      // Best-effort teardown: a cleanup failure must not mask a real result.
    }
    await app.close();

    if (previousLimit === undefined) {
      delete process.env.AUTH_THROTTLE_LIMIT;
    } else {
      process.env.AUTH_THROTTLE_LIMIT = previousLimit;
    }
    if (previousTtl === undefined) {
      delete process.env.AUTH_THROTTLE_TTL_SECONDS;
    } else {
      process.env.AUTH_THROTTLE_TTL_SECONDS = previousTtl;
    }
  });

  function attemptLogin() {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', UA)
      .send({ email: GHOST_EMAIL, password: 'WrongPassword1' });
  }

  function attemptRefresh() {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('User-Agent', UA)
      .set('Cookie', 'refresh_token=not-a-real-token')
      .send();
  }

  it('reports the configured limit on the response, so the wiring is observable', async () => {
    const response = await attemptLogin();

    expect(response.status).toBe(401);
    expect(response.headers['x-ratelimit-limit-auth']).toBe(String(LIMIT));
    expect(response.headers['x-ratelimit-remaining-auth']).toBe(
      String(LIMIT - 1),
    );
  });

  it('answers 401 up to the limit, then 429, and keeps blocking', async () => {
    // One attempt is already spent by the test above.
    for (let attempt = 2; attempt <= LIMIT; attempt += 1) {
      expect((await attemptLogin()).status).toBe(401);
    }

    expect((await attemptLogin()).status).toBe(429);
    // Still blocked on the next attempt: the block lasts the whole window,
    // rather than one request being rejected and the counter resetting.
    expect((await attemptLogin()).status).toBe(429);
  });

  it('leaks nothing in the 429 body', async () => {
    const blocked = await attemptLogin();
    expect(blocked.status).toBe(429);

    // The body must say only that the caller is going too fast. A stack, a
    // Prisma message, or an "unknown account" / "bad password" distinction
    // here would hand an attacker exactly what the throttle exists to deny.
    const serialized = JSON.stringify(blocked.body).toLowerCase();
    expect(serialized).not.toContain('prisma');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain(GHOST_EMAIL.toLowerCase());
  });

  it('throttles /auth/refresh on its own budget, not the login one', async () => {
    /*
     * ThrottlerGuard keys per handler, so each throttled route carries its
     * own counter. That is asserted rather than assumed, because it cuts
     * both ways: refresh cannot be ground down under cover of the login
     * limit already being spent (which is why the first attempt here is a
     * 401, not a 429), but it also means the effective budget for an
     * attacker across all three routes is 3 x LIMIT, not LIMIT. ADR-026
     * accepts that — the routes mint different things and a shared bucket
     * would let a noisy refresh loop lock a user out of logging in.
     */
    expect((await attemptRefresh()).status).toBe(401);

    for (let attempt = 2; attempt <= LIMIT; attempt += 1) {
      expect((await attemptRefresh()).status).toBe(401);
    }
    expect((await attemptRefresh()).status).toBe(429);
  });

  it('does not throttle GET /auth/me, which an authenticated SPA polls', async () => {
    // Unauthenticated here, so 401 is the expected answer — the point is
    // that it is NOT 429 even though this client is already over the limit
    // on the throttled routes.
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('User-Agent', UA);

    expect(response.status).toBe(401);
  });

  it('does not throttle POST /auth/logout, so a user can always end a session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('User-Agent', UA)
      .send();

    expect(response.status).toBe(204);
  });

  it('creates no account and no session while being throttled', async () => {
    const ghost = await prisma.user.findFirst({
      where: { email: GHOST_EMAIL },
    });
    expect(ghost).toBeNull();

    // The 401s before the limit are audited as failed logins; the 429s are
    // rejected by the guard before the service runs, so they are not — a
    // gap already tracked from Phase 11 (rejected operations write no audit
    // row). Asserted as a lower bound so it documents what IS recorded
    // without pinning the exact count.
    const rows = await prisma.auditLog.count({ where: { userAgent: UA } });
    expect(rows).toBeGreaterThanOrEqual(LIMIT);
  });
});
