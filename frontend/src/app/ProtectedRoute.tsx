import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '../components/ui/Spinner';
import { useAuth } from '../features/auth/useAuth';

/**
 * Gate for every authenticated route.
 *
 * While the bootstrap refresh is in flight the answer is genuinely unknown,
 * so it renders a loading state rather than bouncing an authenticated user
 * to `/login` on every page load. This is presentation only: the backend
 * rejects an unauthenticated request regardless of what is rendered here.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'bootstrapping') {
    return <FullPageSpinner label="Checking your session" />;
  }

  if (status === 'unauthenticated') {
    // The intended destination is preserved so signing in lands where the
    // user was actually going.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}
