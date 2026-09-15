import { PrismaClient } from '@prisma/client';

/**
 * Removes the tickets created by the frontend Playwright suite, and nothing
 * else.
 *
 * Scope is deliberately narrow: only rows whose `subject` starts with the
 * fixed `[E2E]` tag that `frontend/e2e/global-setup.ts` prefixes onto every
 * ticket it creates. Matching the fixed prefix rather than one run's id means
 * leftovers from a crashed run are cleaned up by the next one.
 *
 * A single `deleteMany` is sufficient. Every child relation of `Ticket` is
 * declared `onDelete: Cascade` in `prisma/schema.prisma` — TicketComment,
 * TicketHistory, TicketSla, TicketAsset, TicketKnowledgeArticle and
 * Notification — so the database removes the dependent rows itself.
 *
 * This script NEVER touches users, ticket categories, refresh tokens, SLA
 * policies, assets, knowledge articles, or any ticket without the tag. It is
 * not a database reset and must never become one: the seeded development data
 * it runs alongside is expected to survive untouched.
 *
 * Refresh-token rows are a deliberate omission rather than an oversight:
 * `frontend/e2e/global-setup.ts` signs in as the seeded accounts to verify its
 * preconditions, and deleting from that table would also end whatever session
 * the developer running the suite is using.
 */
const E2E_SUBJECT_PREFIX = '[E2E]';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Fails closed unless this is unmistakably a local development database.
 *
 * The script deletes rows and runs automatically at the end of every e2e run,
 * so it must never be one stray `DATABASE_URL` away from doing that somewhere
 * that matters. `[E2E]` is a subject prefix a real user could type, not a
 * reserved namespace, so the blast radius is not zero by construction.
 */
function assertLocalDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to run against NODE_ENV=production');
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL could not be parsed');
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `refusing to delete from a non-local database (host "${host}"). ` +
        'This script is a local test-cleanup helper only.',
    );
  }
}

async function main(): Promise<void> {
  // Constructed FIRST, deliberately: the Prisma client is what loads
  // backend/.env, so DATABASE_URL is undefined until this line runs and a
  // guard placed above it would abort every legitimate local run. A
  // shell-provided DATABASE_URL still wins, since Prisma never overwrites an
  // existing environment variable — so the guard always sees the value the
  // client will actually connect with.
  const prisma = new PrismaClient();
  try {
    assertLocalDatabase();

    const { count } = await prisma.ticket.deleteMany({
      where: { subject: { startsWith: E2E_SUBJECT_PREFIX } },
    });
    console.log(
      `cleanup-e2e-tickets: removed ${count} ticket(s) tagged ${E2E_SUBJECT_PREFIX}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('cleanup-e2e-tickets: failed', error);
  process.exitCode = 1;
});
