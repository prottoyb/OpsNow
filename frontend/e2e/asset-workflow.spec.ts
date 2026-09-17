import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import {
  ACCOUNTS,
  ENV_KEYS,
  taggedAssetName,
  taggedAssetTag,
  taggedSubject,
} from './accounts';

/**
 * The asset management journey (Phase 8b): an agent creates an asset,
 * assigns it to themselves and returns it to stock, links it to a ticket,
 * and an employee viewing that ticket sees the linked asset but gets none of
 * the staff-only affordances on it (D4). The agent then unlinks it.
 *
 * Data isolation rules this spec follows, matching `ticket-workflow.spec.ts`
 * and `sla.spec.ts`:
 *  - The asset it creates carries a unique `E2E-` tagged `assetTag` (the
 *    backend enforces a unique constraint) and an `[E2E]`-tagged name; the
 *    ticket it creates carries a tagged subject. Every assertion is scoped
 *    to these tagged rows, found by their tag or by deep-linking to a
 *    captured id — never a global or unfiltered `total`.
 *  - It creates nothing but the one tagged asset, its assignment ledger
 *    rows, and the one tagged ticket and its link to the asset. Cleanup is
 *    handled by `global-teardown.ts`, which also sweeps `E2E-` assets (see
 *    `backend/test/support/cleanup-e2e-data.ts`).
 *
 * The ticket's requester must be the employee, not the agent: `GET
 * /tickets/:id` is row-scoped, and an out-of-scope ticket 404s rather than
 * 403s (ADR-019). So the employee raises the ticket first, exactly as
 * `ticket-workflow.spec.ts` does, and the agent links the asset to it
 * afterwards.
 *
 * The employee and the agent get separate `browser.newContext()` instances
 * rather than two tabs, for the same reason `ticket-workflow.spec.ts`
 * documents: the refresh cookie is httpOnly and SameSite=Strict, so two tabs
 * would share one session and the handoff would be meaningless.
 */

async function signIn(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tickets', exact: true }),
  ).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in to OpsNow' }),
  ).toBeVisible();
}

test('agent runs an asset through assignment and ticket linking; the employee sees it read-only', async ({
  browser,
}) => {
  const assetTag = taggedAssetTag();
  const assetName = taggedAssetName('Loaner laptop');
  const assetLabel = `${assetTag} — ${assetName}`;
  const ticketSubject = taggedSubject('Laptop needs a replacement battery');
  const assetTypeName = process.env[ENV_KEYS.assetType];
  const categoryName = process.env[ENV_KEYS.category];
  expect(
    assetTypeName,
    'global-setup must publish an asset type name',
  ).toBeTruthy();
  expect(categoryName, 'global-setup must publish a category name').toBeTruthy();

  let employeeContext: BrowserContext | undefined;
  let agentContext: BrowserContext | undefined;

  try {
    employeeContext = await browser.newContext();
    agentContext = await browser.newContext();
    const employee = await employeeContext.newPage();
    const agent = await agentContext.newPage();

    /* -------- employee raises the ticket, becoming its requester -------- */

    await signIn(employee, ACCOUNTS.employee);
    await employee
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'New ticket' })
      .click();

    await employee.getByLabel('Subject').fill(ticketSubject);
    await employee
      .getByLabel('Description')
      .fill('The battery drains to zero within about an hour.');
    await employee.getByLabel('Category').selectOption({ label: categoryName! });
    await employee.getByLabel('Priority').selectOption('High');
    await employee.getByRole('button', { name: 'Create ticket' }).click();

    await expect(
      employee.getByRole('heading', { name: new RegExp(escapeRegExp(ticketSubject)) }),
    ).toBeVisible();

    // Captured so every later step deep-links to THIS ticket rather than
    // hunting through a list whose other contents are unknown.
    const ticketId = employee.url().split('/').pop() ?? '';
    expect(ticketId).not.toEqual('');

    /* ---------------- agent creates the tagged asset ---------------- */

    await signIn(agent, ACCOUNTS.agent);
    await agent
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Assets' })
      .click();
    await expect(
      agent.getByRole('heading', { level: 1, name: 'Assets', exact: true }),
    ).toBeVisible();

    await agent.getByRole('link', { name: 'New asset' }).click();
    await agent.getByLabel('Asset tag').fill(assetTag);
    await agent.getByLabel('Name').fill(assetName);
    await agent.getByLabel('Asset type').selectOption({ label: assetTypeName! });
    await agent.getByRole('button', { name: 'Create asset' }).click();

    await expect(
      agent.getByRole('heading', { name: new RegExp(escapeRegExp(assetLabel)) }),
    ).toBeVisible();

    // Captured so every later step deep-links to THIS asset rather than
    // hunting through a list whose other contents are unknown.
    const assetId = agent.url().split('/').pop() ?? '';
    expect(assetId).not.toEqual('');

    /* ---------------- agent assigns it to themselves ---------------- */

    await agent.getByRole('button', { name: 'Assign to me' }).click();
    await expect(agent.getByText('Asset assigned to you.')).toBeVisible();
    await expect(agent.getByText(/Assigned to:.*\(you\)/)).toBeVisible();
    await expect(
      agent.getByRole('button', { name: 'Return to stock' }),
    ).toBeVisible();

    /* ---------------- agent returns it to stock ---------------- */

    await agent.getByRole('button', { name: 'Return to stock' }).click();
    await expect(agent.getByText('Asset returned to stock.')).toBeVisible();
    await expect(agent.getByText('Assigned to: Unassigned')).toBeVisible();
    await expect(
      agent.getByRole('button', { name: 'Assign to me' }),
    ).toBeVisible();

    /* -------- agent links the asset to the employee's ticket -------- */

    await agent.goto(`/tickets/${ticketId}`);
    await expect(
      agent.getByRole('heading', { name: new RegExp(escapeRegExp(ticketSubject)) }),
    ).toBeVisible();

    await agent.getByRole('button', { name: 'Link an asset' }).click();
    await agent.getByLabel('Search assets').fill(assetTag);
    await expect(agent.getByText(assetLabel)).toBeVisible();
    await agent.getByRole('button', { name: 'Link', exact: true }).click();

    // The picker closes and the panel now shows the linked asset as a link
    // (staff view).
    await expect(agent.getByRole('link', { name: assetLabel })).toBeVisible();

    /* -------- employee opens the ticket: asset is plain text, no staff controls -------- */

    await employee.goto(`/tickets/${ticketId}`);
    await expect(
      employee.getByRole('heading', { name: new RegExp(escapeRegExp(ticketSubject)) }),
    ).toBeVisible();

    await expect(employee.getByText(assetLabel)).toBeVisible();
    // Not a link (D4): an Employee must not be able to navigate to an asset
    // detail page from a ticket, and must not be able to confirm one exists
    // by testing for a 404 vs 403 on it.
    await expect(employee.getByRole('link', { name: assetLabel })).toHaveCount(0);
    await expect(employee.locator('a[href^="/assets/"]')).toHaveCount(0);
    // No unlink or "assign to requester" affordance for an Employee.
    await expect(employee.getByRole('button', { name: 'Unlink' })).toHaveCount(0);
    await expect(
      employee.getByRole('button', { name: 'Assign to requester' }),
    ).toHaveCount(0);

    /* ---------------- agent unlinks the asset ---------------- */

    await agent.getByRole('button', { name: 'Unlink' }).click();
    await expect(
      agent.getByText('No assets are linked to this ticket.'),
    ).toBeVisible();
    await expect(agent.getByRole('link', { name: assetLabel })).toHaveCount(0);

    await signOut(employee);
    await signOut(agent);
  } finally {
    await employeeContext?.close();
    await agentContext?.close();
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
