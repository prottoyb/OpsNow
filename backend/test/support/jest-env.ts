/**
 * Jest setup (unit and e2e): pins the environment-driven switches that must
 * not be decided by whatever happens to be in a developer's `.env`.
 *
 * Runs before any module is imported, so ConfigModule — which loads `.env`
 * WITHOUT overriding variables already present in `process.env` — sees
 * these values.
 */

/*
 * 1. AI assistant: forced to its network-free state (ADR-023).
 *
 * This is deliberately NOT a global block on http/https: supertest and the
 * Prisma connection both need real sockets. The guarantee is structural
 * instead — the live adapter is only constructed when the mode resolves to
 * `anthropic`, which requires a non-empty AI_API_KEY, and here the provider
 * is forced to `disabled` and the key removed. A developer's own vendor key
 * therefore cannot switch a live provider on inside the suite.
 */
process.env.AI_PROVIDER = 'disabled';
delete process.env.AI_API_KEY;

/*
 * 2. Auth throttle (ADR-026): raised, not disabled.
 *
 * Every e2e suite authenticates several role accounts in `beforeAll`, and
 * `jest --runInBand` runs them back to back well inside the production
 * 60-second window, so the shipped limit of 10 would make unrelated suites
 * fail with 429s that look like defects in the code under test.
 *
 * Raising a threshold is not the same as turning the control off, and this
 * must not become the latter:
 *
 *  - the guard itself is still mounted and still executing on every one of
 *    the three auth routes in every suite;
 *  - `test/auth-throttle.e2e-spec.ts` boots its own application with a
 *    deliberately tiny limit and asserts the 429 actually fires, so the
 *    control is covered by a real test rather than by this file's absence;
 *  - `??=` means an explicit value from the shell or from that spec wins.
 *
 * If a future change makes the throttle genuinely untestable without
 * disabling it, that is a finding to report, not a line to delete here.
 */
process.env.AUTH_THROTTLE_LIMIT ??= '10000';
