import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppProviders } from '../app/providers';
import { AppRoutes } from '../app/router';

/**
 * Retries are disabled so an error state renders immediately instead of after
 * the production backoff, and the cache is per-test so nothing leaks between
 * tests.
 *
 * `refetchOnWindowFocus` must be off here too, matching
 * `lib/api/queryClient.ts`'s production default. React Query's focus manager
 * is a module-level singleton: it is not scoped to one `QueryClient`, so a
 * `window` focus/visibilitychange event fired by an EARLIER test in this
 * same file (jsdom's environment, and so `window`, is shared per file, and
 * `userEvent` interactions dispatch real focus events) can trigger a
 * genuine background refetch of THIS test's still-mounted, immediately-stale
 * (`staleTime: 0`) queries. That produced a real, intermittent extra
 * request — not a flake in the assertion, an extra network call the
 * production default already prevents.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export interface RenderOptions {
  route?: string;
  queryClient?: QueryClient;
}

/** Renders the whole routed application at a given URL. */
export function renderApp(options: RenderOptions = {}): RenderResult & {
  queryClient: QueryClient;
} {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const result = render(
    <MemoryRouter initialEntries={[options.route ?? '/tickets']}>
      <AppProviders queryClient={queryClient}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
  return { ...result, queryClient };
}

/** Renders a single component inside the app's providers. */
export function renderWithProviders(
  ui: ReactNode,
  options: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const result = render(
    <MemoryRouter initialEntries={[options.route ?? '/']}>
      <AppProviders queryClient={queryClient}>{ui}</AppProviders>
    </MemoryRouter>,
  );
  return { ...result, queryClient };
}
