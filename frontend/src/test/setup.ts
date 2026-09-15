import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';
import { resetMockState } from '../mocks/handlers';
import { resetApiClientForTests } from '../lib/api/client';

/**
 * jsdom installs its own `AbortController`, whose signals Node's `fetch`
 * (undici, which Vitest's jsdom environment still uses for the network
 * layer) refuses with "Expected signal to be an instance of AbortSignal".
 * Real browsers have no such split — there is one AbortSignal and `fetch`
 * accepts it.
 *
 * Rather than bend `src/lib/api/client.ts` around a test-environment quirk,
 * the signal is stripped here, at the boundary where the two
 * implementations meet. The client's request-timeout and caller-cancellation
 * paths therefore do not cancel during tests; everything else about the
 * request is exercised for real.
 */
function stripIncompatibleAbortSignal(): void {
  const patched = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal) {
      const { signal: _signal, ...rest } = init;
      return patched(input, rest);
    }
    return patched(input, init);
  }) as typeof globalThis.fetch;
}

// `error` so an unhandled request fails the test instead of silently
// passing against a call the app was never meant to make.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  stripIncompatibleAbortSignal();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockState();
  resetApiClientForTests();
});

afterAll(() => server.close());
