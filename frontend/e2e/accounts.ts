/**
 * Seeded development accounts (`backend/prisma/seed.ts`). These are local
 * development credentials only — the seed file is the source of truth and the
 * password is a documented development constant, not a secret. It is still
 * overridable, so a differently-seeded local database does not require a code
 * change (and so the literal is not the only way to run the suite).
 */
const PASSWORD = process.env.OPSNOW_E2E_PASSWORD ?? 'DevPassword123!';

export const ACCOUNTS = {
  admin: { email: 'admin@opsnow.local', password: PASSWORD },
  teamLead: { email: 'teamlead@opsnow.local', password: PASSWORD },
  agent: { email: 'agent1@opsnow.local', password: PASSWORD },
  employee: { email: 'employee1@opsnow.local', password: PASSWORD },
} as const;

export const API_ORIGIN = 'http://localhost:3000';

/** Environment keys the setup exports for the workers to read. */
export const ENV_KEYS = {
  run: 'OPSNOW_E2E_RUN',
  category: 'OPSNOW_E2E_CATEGORY_NAME',
  assetType: 'OPSNOW_E2E_ASSET_TYPE_NAME',
} as const;

export const E2E_TAG = '[E2E]';

/** The fixed prefix `backend/test/support/cleanup-e2e-data.ts` matches assetTag on. */
export const E2E_ASSET_TAG_PREFIX = 'E2E-';

export function runTag(): string {
  const value = process.env[ENV_KEYS.run];
  if (!value) {
    throw new Error(
      `${ENV_KEYS.run} is not set — global-setup.ts did not run or failed.`,
    );
  }
  return value;
}

/** Every ticket this suite creates carries the run tag in its subject. */
export function taggedSubject(text: string): string {
  return `${runTag()} ${text}`;
}

/**
 * Extracts the short hex id `global-setup.ts` embeds in `runTag()`
 * (`"[E2E][a1b2c3d4]"` -> `"a1b2c3d4"`), so `taggedAssetTag()` can build a
 * run-scoped tag without introducing a second, separately-published run id.
 */
function shortRunId(): string {
  const match = /\[([^[\]]+)\]$/.exec(runTag());
  if (!match) {
    throw new Error(`Could not parse a run id out of runTag() = "${runTag()}".`);
  }
  return match[1];
}

let assetTagSequence = 0;

/**
 * Returns a fresh, unique asset tag carrying the `E2E-` prefix the backend
 * cleanup script matches on. `assetTag` has a backend-enforced unique
 * constraint (`assets.asset_tag`), so every call must return a distinct
 * value — this pairs the run's id with an incrementing per-run counter.
 * Always well under the 50-character column limit (`E2E-` + 8 hex chars +
 * `-` + a small counter is ~15 characters).
 */
export function taggedAssetTag(): string {
  assetTagSequence += 1;
  const tag = `${E2E_ASSET_TAG_PREFIX}${shortRunId()}-${assetTagSequence}`;
  if (tag.length > 50) {
    // Defensive only: the format above cannot reach this in practice.
    throw new Error(`Generated asset tag exceeds 50 characters: "${tag}"`);
  }
  return tag;
}

/** Every asset name this suite creates carries the `[E2E]` marker, mirroring `taggedSubject`. */
export function taggedAssetName(text: string): string {
  return `${E2E_TAG} ${text}`;
}
