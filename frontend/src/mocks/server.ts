import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Node-side request interception for Vitest only. `msw/browser` and
 * `setupWorker` are never used in this project — there is no
 * `public/mockServiceWorker.js` and `msw init` is never run — so the mock
 * API cannot leak into a real browser session.
 */
export const server = setupServer(...handlers);
