import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { ACCOUNTS, ENV_KEYS, taggedSubject } from './accounts';

/**
 * The one end-to-end journey: an employee raises a ticket, an agent picks it
 * up and adds an internal note, the employee cannot see that note, the agent
 * resolves, and the employee reopens.
 *
 * Data isolation rules this spec follows:
 *  - It only ever asserts on the ticket it created, found by its tagged
 *    subject or by deep-linking to its captured id.
 *  - It never asserts on a global or unfiltered `total`, and never assumes
 *    anything about how many other tickets exist in the developer's database.
 *  - It creates nothing but the one tagged ticket and its comments; cleanup
 *    is handled by `global-teardown.ts`.
 *
 * The employee and the agent get separate `browser.newContext()` instances
 * rather than two tabs: the refresh cookie is httpOnly and SameSite=Strict,
 * and each context has its own cookie jar, so two tabs would share one
 * session and the handoff would be meaningless.
 */

async function signIn(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  await page.goto('/login');
  // Substring matching on purpose: a required field's <label> also contains
  // the visual "*" marker (aria-hidden, but still part of the label's text),
  // so an exact match would never resolve.
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Level 1 and exact: the filter panel has an sr-only "Filter tickets" <h2>.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tickets', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(account.email)).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in to OpsNow' }),
  ).toBeVisible();
}

test('employee raises a ticket, agent triages it privately, employee reopens', async ({
  browser,
}) => {
  const subject = taggedSubject('Laptop will not power on');
  const categoryName = process.env[ENV_KEYS.category];
  expect(categoryName, 'global-setup must publish a category name').toBeTruthy();

  let employeeContext: BrowserContext | undefined;
  let agentContext: BrowserContext | undefined;

  try {
    employeeContext = await browser.newContext();
    agentContext = await browser.newContext();
    const employee = await employeeContext.newPage();
    const agent = await agentContext.newPage();

    /* ---------------- employee raises the ticket ---------------- */

    await signIn(employee, ACCOUNTS.employee);
    await employee.getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'New ticket' })
      .click();

    await employee.getByLabel('Subject').fill(subject);
    await employee
      .getByLabel('Description')
      .fill('Pressing the power button does nothing at all.');
    await employee.getByLabel('Category').selectOption({ label: categoryName! });
    await employee.getByLabel('Priority').selectOption('High');
    await employee.getByRole('button', { name: 'Create ticket' }).click();

    await expect(
      employee.getByRole('heading', { name: new RegExp(escapeRegExp(subject)) }),
    ).toBeVisible();

    // Captured so every later assertion deep-links to THIS ticket rather than
    // hunting through a list whose other contents are unknown.
    const ticketUrl = employee.url();
    const ticketId = ticketUrl.split('/').pop() ?? '';
    expect(ticketId).not.toEqual('');

    /* ---------------- agent triages it ---------------- */

    await signIn(agent, ACCOUNTS.agent);
    await agent.goto(`/tickets/${ticketId}`);
    await expect(
      agent.getByRole('heading', { name: new RegExp(escapeRegExp(subject)) }),
    ).toBeVisible();

    await agent.getByRole('button', { name: 'Assign to me' }).click();
    await expect(agent.getByText('Ticket assigned to you.')).toBeVisible();

    await agent.getByRole('button', { name: 'Move to In progress' }).click();
    await expect(agent.getByText(/status changed to inprogress/i)).toBeVisible();

    const internalNote =
      'Internal: out of warranty, raising a procurement request.';
    await agent.getByLabel('Add a comment').fill(internalNote);
    await agent.getByRole('radio', { name: /internal note/i }).check();
    await agent.getByRole('button', { name: 'Post comment' }).click();
    await expect(agent.getByText('Comment posted.')).toBeVisible();
    await expect(agent.getByText(internalNote)).toBeVisible();
    // Exact: the comment form's radio is labelled "Internal note — staff only".
    await expect(
      agent.getByText('Internal note', { exact: true }),
    ).toBeVisible();

    /* ------- the employee must NOT be able to see that note ------- */

    await employee.goto(`/tickets/${ticketId}`);
    await expect(
      employee.getByRole('heading', { name: new RegExp(escapeRegExp(subject)) }),
    ).toBeVisible();
    await expect(employee.getByLabel('Add a comment')).toBeVisible();
    await expect(employee.getByText(internalNote)).toHaveCount(0);
    await expect(employee.getByText('Internal note')).toHaveCount(0);
    // The History tab is staff-only.
    await expect(employee.getByRole('tab', { name: 'History' })).toHaveCount(0);

    /* ---------------- agent resolves ---------------- */

    await agent.getByRole('button', { name: 'Move to Resolved' }).click();
    await expect(agent.getByText(/status changed to resolved/i)).toBeVisible();

    /* ---------------- employee reopens ---------------- */

    await employee.reload();
    await employee.getByRole('button', { name: 'Reopen ticket' }).click();
    await expect(employee.getByText(/status changed to open/i)).toBeVisible();

    // The only list assertion in the suite: this specific tagged ticket is
    // visible to its requester. Nothing is asserted about the list's size.
    await employee.getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Tickets' })
      .click();
    await expect(
      employee.getByRole('link', { name: subject }).first(),
    ).toBeVisible();

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
