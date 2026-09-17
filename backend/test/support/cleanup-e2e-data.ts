import { PrismaClient } from '@prisma/client';

/**
 * Removes the tickets and assets created by the frontend Playwright suite,
 * and nothing else.
 *
 * Scope is deliberately narrow, on two independent fixed prefixes:
 *  - Tickets whose `subject` starts with `[E2E]`, the tag
 *    `frontend/e2e/global-setup.ts` prefixes onto every ticket it creates
 *    (via `taggedSubject`).
 *  - Assets whose `assetTag` starts with `E2E-`, the prefix
 *    `frontend/e2e/accounts.ts`'s `taggedAssetTag()` generates.
 * Matching a fixed prefix rather than one run's id means leftovers from a
 * crashed run are cleaned up by the next one.
 *
 * Each is a single `deleteMany`. Every child relation of `Ticket` is
 * declared `onDelete: Cascade` in `prisma/schema.prisma` — TicketComment,
 * TicketHistory, TicketSla, TicketAsset, TicketKnowledgeArticle and
 * Notification — so the database removes the dependent rows itself. The same
 * is true of `Asset`'s two child relations, `AssetAssignment.asset` and
 * `TicketAsset.asset`, both also `onDelete: Cascade` — so deleting a tagged
 * asset removes its assignment ledger rows and any ticket links in the same
 * statement. `Asset.assetType` is `onDelete: Restrict`, so this can never
 * accidentally remove an `AssetType` row even if one were tagged, which none
 * ever are — asset types are not created by this suite at all.
 *
 * This script NEVER touches users, ticket categories, refresh tokens, SLA
 * policies, asset types, knowledge articles, or any ticket/asset without its
 * tag. It is not a database reset and must never become one: the seeded
 * development data it runs alongside — including the seeded assets and asset
 * types — is expected to survive untouched.
 *
 * Refresh-token rows are a deliberate omission rather than an oversight:
 * `frontend/e2e/global-setup.ts` signs in as the seeded accounts to verify its
 * preconditions, and deleting from that table would also end whatever session
 * the developer running the suite is using.
 */
const E2E_SUBJECT_PREFIX = '[E2E]';
const E2E_ASSET_TAG_PREFIX = 'E2E-';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Fails closed unless this is unmistakably a local development database.
 *
 * The script deletes rows and runs automatically at the end of every e2e run,
 * so it must never be one stray `DATABASE_URL` away from doing that somewhere
 * that matters. Neither tag is a reserved namespace — a real user could type
 * a `[E2E]` subject or an `E2E-` asset tag — so the blast radius is not zero
 * by construction.
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

    const { count: ticketCount } = await prisma.ticket.deleteMany({
      where: { subject: { startsWith: E2E_SUBJECT_PREFIX } },
    });
    console.log(
      `cleanup-e2e-data: removed ${ticketCount} ticket(s) tagged ${E2E_SUBJECT_PREFIX}.`,
    );

    const { count: assetCount } = await prisma.asset.deleteMany({
      where: { assetTag: { startsWith: E2E_ASSET_TAG_PREFIX } },
    });
    console.log(
      `cleanup-e2e-data: removed ${assetCount} asset(s) tagged ${E2E_ASSET_TAG_PREFIX}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('cleanup-e2e-data: failed', error);
  process.exitCode = 1;
});
