import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { ACCOUNTS, ENV_KEYS, taggedSubject } from './accounts';

/**
 * SLA end-to-end coverage (Phase 7b).
 *
 * Data isolation follows the same rules as `ticket-workflow.spec.ts`: this
 * spec creates exactly one tagged ticket, only ever asserts on that ticket,
 * and leaves cleanup to `global-teardown.ts`. Nothing is seeded, reset or
 * wiped.
 *
 * The dashboard assertions are deliberately STRUCTURAL — headings, metric
 * labels, table columns. The developer's database contains whatever tickets
 * it contains, so any assertion on an actual metric COUNT would be asserting
 * on state this test does not own.
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

/**
 * `.last()` because the page's outer <section> also contains the panel's
 * heading; the innermost match is the panel itself.
 */
function slaPanel(page: Page) {
  return page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { level: 2, name: 'SLA', exact: true }),
    })
    .last();
}

test('an employee sees SLA state on their ticket but not the staff dashboard', async ({
  browser,
}) => {
  const subject = taggedSubject('Monitor flickers on the SLA panel');
  const categoryName = process.env[ENV_KEYS.category];
  expect(categoryName, 'global-setup must publish a category name').toBeTruthy();

  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext();
    const employee = await context.newPage();

    await signIn(employee, ACCOUNTS.employee);

    // The list carries an SLA column.
    await expect(
      employee.getByRole('columnheader', { name: 'SLA' }),
    ).toBeVisible();

    // The SLA dashboard is staff-only: no nav link…
    await expect(
      employee
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'SLA' }),
    ).toHaveCount(0);

    // …and deep-linking to it falls through to the catch-all, not a 403 page.
    await employee.goto('/sla');
    await expect(
      employee.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeVisible();

    /* ---------------- raise a ticket and read its SLA ---------------- */

    await employee.goto('/tickets/new');
    await employee.getByLabel('Subject').fill(subject);
    await employee
      .getByLabel('Description')
      .fill('The external monitor flickers about once a minute.');
    await employee.getByLabel('Category').selectOption({ label: categoryName! });
    await employee.getByLabel('Priority').selectOption('High');
    await employee.getByRole('button', { name: 'Create ticket' }).click();

    await expect(
      employee.getByRole('heading', { name: new RegExp(escapeRegExp(subject)) }),
    ).toBeVisible();

    const panel = slaPanel(employee);
    await expect(panel).toBeVisible();
    // A brand-new ticket's clocks are both live, and the panel names each one.
    await expect(panel.getByText('Response on track')).toBeVisible();
    await expect(panel.getByText('Resolution on track')).toBeVisible();
    // Every timestamp is a semantic <time> with a machine-readable value.
    const times = panel.locator('time');
    await expect(times.first()).toHaveAttribute('datetime', /^\d{4}-/);

    // Captured so the staff half below deep-links to THIS ticket rather than
    // hunting through a list whose other contents are unknown.
    const ticketId = employee.url().split('/').pop() ?? '';
    expect(ticketId).not.toEqual('');

    /* ---------------- staff view of the same ticket ---------------- */

    const agentContext = await browser.newContext();
    try {
      const agent = await agentContext.newPage();
      await signIn(agent, ACCOUNTS.agent);

      await agent.goto(`/tickets/${ticketId}`);
      const agentPanel = slaPanel(agent);
      await expect(agentPanel).toBeVisible();
      // Identical SLA shape for staff — no extra or missing fields.
      await expect(agentPanel.getByText('Response on track')).toBeVisible();
      await expect(agentPanel.getByText('Resolution on track')).toBeVisible();

      /* ---------------- the staff-only dashboard ---------------- */

      await agent
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'SLA' })
        .click();

      await expect(
        agent.getByRole('heading', { level: 1, name: 'SLA', exact: true }),
      ).toBeVisible();
      await expect(
        agent.getByRole('heading', { name: 'Service level metrics' }),
      ).toBeVisible();

      for (const label of [
        'Open tickets with an SLA',
        'Resolution overdue (still open)',
        'Resolution breached (already resolved)',
        'Responded on time',
        'Responded late',
        'Response overdue (no reply yet)',
        'Resolved with no response',
      ]) {
        await expect(agent.getByText(label, { exact: true })).toBeVisible();
      }

      // Stated plainly rather than fabricated.
      await expect(
        agent.getByText(/An at-risk total is not available/),
      ).toBeVisible();

      await expect(
        agent.getByRole('heading', { name: 'SLA policies' }),
      ).toBeVisible();
      const policyTable = agent.getByRole('table');
      for (const header of [
        'Policy',
        'Priority',
        'Response target',
        'Resolution target',
        'Status',
      ]) {
        await expect(
          policyTable.getByRole('columnheader', { name: header }),
        ).toBeVisible();
      }
      // At least one policy row exists; nothing is asserted about how many.
      await expect(policyTable.locator('tbody tr').first()).toBeVisible();
    } finally {
      await agentContext.close();
    }
  } finally {
    await context?.close();
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
