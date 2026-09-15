import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { createQueryClient } from '../lib/api/queryClient';
import { AuthProvider } from '../features/auth/AuthContext';

/**
 * `AuthProvider` sits inside `QueryClientProvider` because it must be able
 * to clear the query cache whenever the signed-in identity changes.
 *
 * There are deliberately no React Query Devtools here: they would ship a
 * cache inspector — including staff-only internal notes — into the bundle.
 */
export function AppProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  /** Injected by tests so each test gets an isolated cache. */
  queryClient?: QueryClient;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
