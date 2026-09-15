import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useAuth } from '../features/auth/useAuth';

const ROLE_LABELS: Record<string, string> = {
  Employee: 'Employee',
  SupportAgent: 'Support agent',
  TeamLead: 'Team lead',
  Administrator: 'Administrator',
};

export function AppLayout() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-slate-900"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link
              to="/tickets"
              className="text-base font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              OpsNow
            </Link>
            <nav aria-label="Main">
              <ul className="flex items-center gap-4 text-sm">
                <li>
                  <NavLink
                    to="/tickets"
                    end
                    className={({ isActive }) =>
                      `rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                        isActive
                          ? 'font-semibold text-slate-900 underline'
                          : 'text-slate-600 hover:text-slate-900'
                      }`
                    }
                  >
                    Tickets
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/tickets/new"
                    className={({ isActive }) =>
                      `rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                        isActive
                          ? 'font-semibold text-slate-900 underline'
                          : 'text-slate-600 hover:text-slate-900'
                      }`
                    }
                  >
                    New ticket
                  </NavLink>
                </li>
              </ul>
            </nav>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              {/*
                Email + role only. `GET /auth/me` does not return the user's
                name, so showing the name would make the header change after
                a page reload.
              */}
              <p className="text-sm text-slate-700">
                <span className="font-medium">{user.email}</span>
                <span className="text-slate-500">
                  {' '}
                  · {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </p>
              <Button
                variant="secondary"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6"
      >
        <Outlet />
      </main>
    </div>
  );
}
