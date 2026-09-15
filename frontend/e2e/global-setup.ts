import { randomUUID } from 'node:crypto';
import { ACCOUNTS, API_ORIGIN, E2E_TAG, ENV_KEYS } from './accounts';

/**
 * Verifies the suite's preconditions and aborts with an actionable message if
 * they are not met.
 *
 * This setup NEVER seeds, resets or mutates data it did not create. If the
 * database is not in the expected state the developer is told to run the seed
 * themselves, with the warning that doing so wipes existing data — that
 * decision is not one an automated test run gets to make.
 */

function abort(problem: string): never {
  throw new Error(
    [
      '',
      'OpsNow end-to-end preconditions are not met.',
      '',
      `  ${problem}`,
      '',
      'This suite runs against your local development stack and deliberately',
      'does not create or reset any data it does not own. To get set up:',
      '',
      '  1. Start PostgreSQL and make sure the opsnow_dev database exists.',
      '  2. cd backend && npm run start:dev   (API on http://localhost:3000)',
      '  3. If the seeded accounts or categories are missing, run',
      '       cd backend && npm run prisma:seed',
      '     WARNING: the seed script wipes existing data. Run it yourself,',
      '     deliberately — the test suite will never run it for you.',
      '',
    ].join('\n'),
  );
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text === '' ? undefined : JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json };
}

export default async function globalSetup(): Promise<void> {
  // 1. Backend reachable and healthy (the health check pings the database).
  let health: Response;
  try {
    health = await fetch(`${API_ORIGIN}/api/v1/health`);
  } catch {
    abort(`The API at ${API_ORIGIN} is not responding.`);
  }
  if (!health.ok) {
    abort(
      `GET ${API_ORIGIN}/api/v1/health returned ${health.status} — the API is up but unhealthy (usually the database).`,
    );
  }

  // 2. Every seeded account this suite uses can sign in.
  let accessToken = '';
  for (const [name, account] of Object.entries(ACCOUNTS)) {
    const { status, json } = await postJson('/api/v1/auth/login', account);
    if (status !== 200) {
      abort(
        `The seeded account ${account.email} (${name}) could not sign in (HTTP ${status}).`,
      );
    }
    accessToken = (json as { accessToken: string }).accessToken;
  }

  // 3. At least one active ticket category exists. The category is chosen by
  //    NAME from the live response at runtime — a seeded UUID is never
  //    hardcoded, because ids differ per database.
  const categoriesResponse = await fetch(`${API_ORIGIN}/api/v1/ticket-categories`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!categoriesResponse.ok) {
    abort(
      `GET /api/v1/ticket-categories returned ${categoriesResponse.status}.`,
    );
  }
  const categories = (await categoriesResponse.json()) as Array<{
    name: string;
    isActive: boolean;
  }>;
  const usable = categories.find((category) => category.isActive);
  if (!usable) {
    abort('No active ticket category exists.');
  }

  // 4. Publish the run identity. Workers inherit process.env, and every
  //    ticket the suite creates is prefixed with the run tag so teardown can
  //    find exactly what this run made — and nothing else.
  const runId = randomUUID().slice(0, 8);
  process.env[ENV_KEYS.tag] = E2E_TAG;
  process.env[ENV_KEYS.run] = `${E2E_TAG}[${runId}]`;
  process.env[ENV_KEYS.category] = usable.name;

  console.log(
    `e2e: run tag ${process.env[ENV_KEYS.run]}, category "${usable.name}"`,
  );
}
