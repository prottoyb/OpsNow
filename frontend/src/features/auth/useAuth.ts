import { use } from 'react';
import { AuthContext } from './auth.context';
import type { AuthContextValue } from './auth.context';
import { isStaffRole } from '../../types/api';

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}

/**
 * Role-derived UI affordances. These decide what is *offered*, never what is
 * *allowed* — every gated action is independently enforced in
 * `backend/src/tickets/tickets.service.ts`, and each one has a working 403
 * path in the UI for exactly that reason.
 */
export function useIsStaff(): boolean {
  const { user } = useAuth();
  return user ? isStaffRole(user.role) : false;
}
