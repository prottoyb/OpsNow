/**
 * Jest setup (unit and e2e): pins the AI assistant to its network-free state
 * before any module is imported (ADR-023).
 *
 * This is deliberately NOT a global block on http/https: supertest and the
 * Prisma connection both need real sockets. The guarantee is structural
 * instead — the live adapter is only constructed when the mode resolves to
 * `anthropic`, which requires a non-empty AI_API_KEY, and here the provider
 * is forced to `disabled` and the key removed. A developer's own `.env` (which
 * ConfigModule loads WITHOUT overriding variables already set) therefore
 * cannot switch a live provider on inside the suite.
 */
process.env.AI_PROVIDER = 'disabled';
delete process.env.AI_API_KEY;
