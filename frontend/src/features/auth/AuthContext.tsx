import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
} from '../../lib/api/client';
import type { AuthenticatedUser } from '../../types/api';
import * as authApi from './auth.api';
import { AuthContext } from './auth.context';
import type { AuthContextValue, AuthStatus } from './auth.context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  /**
   * Clearing the cache on ANY identity change — not just on sign-out — is a
   * confidentiality control, not housekeeping. Without it, a support agent's
   * cached ticket list and internal notes would still be in memory when an
   * Employee signs in next on the same browser, and TanStack Query would
   * serve them as placeholder data before the refetch lands.
   *
   * It is done synchronously at each of the three call sites that change
   * identity (sign-in, sign-out, expiry) rather than in an effect watching
   * `user`. An effect runs *after* the render that first shows the
   * authenticated routes, so it would wipe the queries those routes had just
   * registered and leave the page stuck with no data. Bootstrap needs no
   * clear: it moves from "no user" to a user with an empty cache.
   */

  // A failed refresh means the session is genuinely over: drop the user so
  // ProtectedRoute redirects, and surface a notice on the login page rather
  // than dumping the user at a bare form with no explanation.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setSessionExpired(true);
      setStatus('unauthenticated');
      queryClient.clear();
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  // Bootstrap: exchange the httpOnly refresh cookie for an access token,
  // then load the current user. This is how a session survives F5 while the
  // access token lives only in memory.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const refreshed = await refreshSession();
      if (cancelled) return;
      if (!refreshed) {
        setStatus('unauthenticated');
        return;
      }
      try {
        const me = await authApi.fetchCurrentUser();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login(email, password);
      // Cleared before the new identity is published to the tree, so nothing
      // cached under the previous one can be read by the incoming user.
      queryClient.clear();
      setAccessToken(result.accessToken);
      // Only id/email/role are kept. The login response also carries the
      // user's name, but `GET /auth/me` does not, so storing it would make
      // the header change after a reload.
      setUser({
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
      });
      setSessionExpired(false);
      setStatus('authenticated');
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // A failed logout request is not actionable for the user and must not
      // propagate: the local session is torn down either way below, and
      // rethrowing would surface as an unhandled rejection in the console
      // every time the network hiccups on the way out.
    } finally {
      // Local state is cleared even if the logout request fails, so the
      // browser never keeps showing an authenticated shell.
      setAccessToken(null);
      setUser(null);
      setSessionExpired(false);
      setStatus('unauthenticated');
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, signIn, signOut }),
    [status, user, sessionExpired, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
