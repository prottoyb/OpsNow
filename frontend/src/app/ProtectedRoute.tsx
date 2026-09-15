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
    // user was actually going — but only when it is unambiguously a path on
    // this app. A protocol-relative value like `//example.com/x` is a valid
    // pathname that react-router refuses to navigate to, which would strand
    // the user on a broken page immediately after a successful sign-in.
    const target = `${location.pathname}${location.search}`;
    const from = /^\/(?!\/)/.test(target) ? target : undefined;
    return <Navigate to="/login" replace state={from ? { from } : undefined} />;
  }

  return <>{children}</>;
}
