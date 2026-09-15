/**
 * Seeded development accounts (`backend/prisma/seed.ts`). These are local
 * development credentials only — the seed file is the source of truth and the
 * password is a documented development constant, not a secret.
 */
export const ACCOUNTS = {
  admin: { email: 'admin@opsnow.local', password: 'DevPassword123!' },
  teamLead: { email: 'teamlead@opsnow.local', password: 'DevPassword123!' },
  agent: { email: 'agent1@opsnow.local', password: 'DevPassword123!' },
  employee: { email: 'employee1@opsnow.local', password: 'DevPassword123!' },
} as const;

export const API_ORIGIN = 'http://localhost:3000';
export const APP_ORIGIN = 'http://localhost:5173';

/** Environment keys the setup exports for the workers to read. */
export const ENV_KEYS = {
  tag: 'OPSNOW_E2E_TAG',
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
