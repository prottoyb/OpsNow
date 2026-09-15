import { apiFetch } from '../../lib/api/client';
import type { AuthenticatedUser, LoginResponse } from '../../types/api';

/**
 * Every call here sets `skipAuthRefresh`: a 401 from an auth endpoint IS the
 * answer (bad credentials, dead session), so refreshing and retrying would
 * be meaningless — and in the case of `/auth/refresh` itself, recursive.
 */

export function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRefresh: true,
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', {
    method: 'POST',
    skipAuthRefresh: true,
  });
}

/**
 * Returns id/email/role only — `GET /auth/me` deliberately does not include
 * the user's name (see `backend/src/auth/auth.controller.ts`).
 */
export function fetchCurrentUser(): Promise<AuthenticatedUser> {
  // `skipAuthRefresh` is correct only because the sole caller is the
  // bootstrap, which has just refreshed: a 401 here means that brand-new token
  // was rejected, so refreshing again would be a pointless second round trip.
  // /auth/me is otherwise an ordinary bearer-protected resource, so a future
  // mid-session caller should DROP this flag and let the normal
  // refresh-and-retry path recover instead of failing outright.
  return apiFetch<AuthenticatedUser>('/auth/me', { skipAuthRefresh: true });
}
