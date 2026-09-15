import { createContext } from 'react';
import type { AuthenticatedUser } from '../../types/api';

/**
 * The context object lives in its own module so `AuthContext.tsx` exports
 * only a component (Fast Refresh requirement) and `useAuth.ts` can consume
 * the context without importing the provider.
 */
export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  /** True once a session ended because a refresh failed, not by signing out. */
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
