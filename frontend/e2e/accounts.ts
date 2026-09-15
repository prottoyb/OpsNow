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
} as const;

export const E2E_TAG = '[E2E]';

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
