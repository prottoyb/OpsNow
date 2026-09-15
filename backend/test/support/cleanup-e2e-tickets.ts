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
 */
const E2E_SUBJECT_PREFIX = '[E2E]';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
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
