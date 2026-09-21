import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';

export interface PanelStateProps<T> {
  /** What the panel shows, for the loading/error wording. */
  subject: string;
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}

/**
 * Loading / error / success for one panel. Each panel owns its own state so a
 * failing tab never blanks another.
 *
 * `isLoading`, not `isPending`: a DISABLED query (hidden tab, or a range that
 * cannot be requested) stays pending forever and must render nothing, not a
 * spinner that never resolves — same reasoning as `SlaDashboardPage`.
 *
 * A 400 and a 403 get their own wording rather than the raw message alone:
 * both are reachable only by hand (the UI validates the range and never asks
 * for a view the role cannot have), so the text says what to do about them.
 */
export function PanelState<T>({
  subject,
  query,
  children,
}: PanelStateProps<T>) {
  if (query.isLoading) {
    return <Spinner label={`Loading ${subject}`} />;
  }

  if (query.isError) {
    const error = toApiError(query.error);
    const title = error.isForbidden
      ? `You do not have access to ${subject}`
      : error.isValidationError
        ? `The filters were not accepted for ${subject}`
        : `Could not load ${subject}`;
    return (
      <ErrorState
        title={title}
        messages={error.messages}
        // Retrying a 403 or 400 with the same request cannot change anything.
        onRetry={
          error.isForbidden || error.isValidationError
            ? undefined
            : () => void query.refetch()
        }
      />
    );
  }

  if (query.isSuccess) {
    return <>{children(query.data)}</>;
  }

  return null;
}
