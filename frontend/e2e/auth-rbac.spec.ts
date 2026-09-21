import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { ACCOUNTS } from './accounts';

/**
 * Authentication and role-based access, end to end (Phase 13).
 *
 * Until now the Playwright suite signed in as a prerequisite for testing
 * something else; nothing exercised the session itself, and nothing checked
 * that a role sees only what it should through a real browser. Those are the
 * two places where a mistake is both easy to make and invisible to the
 * backend's own tests — the API can be perfectly gated while the SPA still
 * offers a link that 403s, or drops a session on reload.
 *
 * This spec creates NO data. It signs in, navigates, and signs out. Every
 * assertion is about what the browser is shown, never about rows, so it does
 * not depend on the state of the developer's database.
 *
 * On what it does NOT assert: the navigation checks below are about what the
 * UI offers, not about enforcement. The real gate is the backend's `@Roles()`
 * guard, which has its own e2e coverage. A missing link is a usability and
 * information-disclosure property; the 403 behind it is a separate one.
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

function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

test.describe('authentication', () => {
  test('rejects bad credentials without leaking whether the account exists', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(ACCOUNTS.employee.email);
    await page.getByLabel('Password').fill('DefinitelyNotThePassword1');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Could not sign you in')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    /*
     * A real account with a wrong password must be indistinguishable from an
     * account that does not exist. Both are the backend's single
     * "Invalid email or password" message; anything that named the account,
     * or said "unknown user", would turn the login form into an account
     * enumeration oracle.
     */
    const realAccountError = await page
      .getByText('Invalid email or password')
      .textContent();

    await page.getByLabel('Email address').fill('no-such-person@opsnow.local');
    await page.getByLabel('Password').fill('DefinitelyNotThePassword1');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
    expect(
      await page.getByText('Invalid email or password').textContent(),
    ).toBe(realAccountError);
  });

  test('sends an unauthenticated visitor to the login page and back again', async ({
    browser,
  }) => {
    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext();
      const page = await context.newPage();

      // A deep link, not the root: the destination has to survive the bounce.
      await page.goto('/assets?status=InStock');
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Sign in to OpsNow' }),
      ).toBeVisible();

      await page.getByLabel('Email address').fill(ACCOUNTS.employee.email);
      await page.getByLabel('Password').fill(ACCOUNTS.employee.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page).toHaveURL(/\/assets\?status=InStock$/);
      // "My assets", not "Assets": an Employee's list is row-scoped to
      // their own equipment and both the heading and the nav label say so.
      await expect(
        page.getByRole('heading', { level: 1, name: 'My assets', exact: true }),
      ).toBeVisible();
    } finally {
      await context?.close();
    }
  });

  test('keeps the session across a reload, then ends it on sign out', async ({
    browser,
  }) => {
    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext();
      const page = await context.newPage();

      await signIn(page, ACCOUNTS.agent);

      /*
       * The access token lives in memory only, so surviving a reload proves
       * the refresh cookie round-tripped: SameSite=Strict, path-scoped to
       * /api/v1/auth, and accepted by the backend's same-origin check
       * through the Vite proxy. That combination is easy to break and breaks
       * silently — the user is simply logged out.
       */
      await page.reload();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Tickets', exact: true }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login$/);

      // The cookie is gone, so a protected route does not let them back in.
      await page.goto('/tickets');
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await context?.close();
    }
  });
});

test.describe('role-based access', () => {
  /**
   * Staff-only and Administrator-only areas, as the navigation offers them.
   * Kept as one table so a new gated page is added in one place, and so the
   * positive and negative cases cannot drift apart.
   */
  const GATED_LINKS = ['SLA', 'Dashboard', 'Audit log'] as const;

  const EXPECTED: Record<
    'employee' | 'agent' | 'admin',
    readonly (typeof GATED_LINKS)[number][]
  > = {
    // An Employee gets tickets, assets and the knowledge base only.
    employee: [],
    // Staff, but not line management: no audit log.
    agent: ['SLA', 'Dashboard'],
    admin: ['SLA', 'Dashboard', 'Audit log'],
  };

  for (const role of ['employee', 'agent', 'admin'] as const) {
    test(`a signed-in ${role} is offered exactly the right navigation`, async ({
      browser,
    }) => {
      let context: BrowserContext | undefined;
      try {
        context = await browser.newContext();
        const page = await context.newPage();
        await signIn(page, ACCOUNTS[role]);

        for (const link of GATED_LINKS) {
          const expected = EXPECTED[role].includes(link) ? 1 : 0;
          await expect(
            mainNav(page).getByRole('link', { name: link, exact: true }),
            `${role} should ${expected ? '' : 'not '}see the "${link}" link`,
          ).toHaveCount(expected);
        }

        // Everyone keeps the ungated areas. The assets link is labelled
        // "My assets" for an Employee, because their list is row-scoped to
        // their own equipment rather than being the full inventory.
        const assetsLink = role === 'employee' ? 'My assets' : 'Assets';
        for (const link of ['Tickets', assetsLink, 'Knowledge base']) {
          await expect(
            mainNav(page).getByRole('link', { name: link, exact: true }),
          ).toHaveCount(1);
        }
      } finally {
        await context?.close();
      }
    });
  }

  test('typing a gated URL directly gets an employee the ordinary not-found page', async ({
    browser,
  }) => {
    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, ACCOUNTS.employee);

      for (const path of ['/sla', '/dashboard', '/audit']) {
        await page.goto(path);

        /*
         * "Page not found", not a 403 screen, and deliberately so: telling
         * someone a page exists but is off-limits is itself information.
         * The page must also not mount and then fail, which would mean its
         * queries fired and the backend answered 403 — so the absence of an
         * error alert is part of the assertion, not incidental.
         */
        await expect(
          page.getByRole('heading', { level: 1, name: 'Page not found' }),
        ).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
    } finally {
      await context?.close();
    }
  });

  test('an employee cannot reach the staff-only create pages', async ({
    browser,
  }) => {
    let context: BrowserContext | undefined;
    try {
      context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, ACCOUNTS.employee);

      // Creating an asset and authoring a knowledge article are staff-only
      // on the backend (POST /assets, POST /kb-articles).
      for (const path of ['/assets/new', '/kb/new']) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Page not found' }),
        ).toBeVisible();
      }

      // But raising a ticket is not — every role may do that.
      await page.goto('/tickets/new');
      await expect(
        page.getByRole('heading', { level: 1, name: 'New ticket' }),
      ).toBeVisible();
    } finally {
      await context?.close();
    }
  });
});
