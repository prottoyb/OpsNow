import { QueryClient } from '@tanstack/react-query';
import { ApiError, NETWORK_ERROR_STATUS } from './errors';

const MAX_RETRIES = 2;

/**
 * Retrying a 4xx is pointless — the request was rejected on its merits, and
 * a 401 has already been through refresh-and-retry inside the API client.
 * Only transport failures and 5xx are worth another attempt.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) {
    return false;
  }
  if (error instanceof ApiError) {
    return error.status === NETWORK_ERROR_STATUS || error.status >= 500;
  }
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // A mutation is not idempotent; a retried PATCH could apply twice.
        retry: false,
      },
    },
  });
}
