import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ErrorBoundary } from './ErrorBoundary';
import { useCanViewAudit } from '../features/audit/useAudit';
import { useAuth, useIsStaff } from '../features/auth/useAuth';

const NAV_LINK_CLASSES =
  'block rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 md:px-3 md:py-1.5';

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return `${NAV_LINK_CLASSES} ${
    isActive
      ? 'bg-brand-50 font-semibold text-brand-700'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  }`;
}

const ROLE_LABELS: Record<string, string> = {
  Employee: 'Employee',
  SupportAgent: 'Support agent',
  TeamLead: 'Team lead',
  Administrator: 'Administrator',
};

/** A plain three-line/X glyph — no icon library is used anywhere in this app (ADR-016/017). */
function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="size-5"
    >
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const isStaff = useIsStaff();
  const canViewAudit = useCanViewAudit();
  const [signingOut, setSigningOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // A route change is the clearest possible signal the drawer's job is done,
  // and closing it here also covers the case a link inside it was activated.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    // Move focus into the panel so a keyboard user isn't left behind on the
    // now-hidden-behind-the-backdrop trigger button.
    const firstLink = navRef.current?.querySelector<HTMLElement>('a');
    firstLink?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

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
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-brand-700"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            to="/tickets"
            className="flex items-center gap-2 border-r border-slate-200 pr-4 text-base font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white"
            >
              O
            </span>
            OpsNow
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
                {/*
                  Email + role only. `GET /auth/me` does not return the
                  user's name, so showing the name would make the header
                  change after a page reload. Hidden below `sm` — not
                  removed, only its text — so the Sign out button (the part
                  that must stay reachable at every width, and must stay a
                  single instance rather than a second one duplicated into
                  the drawer, which would make `getByRole('button', { name:
                  /sign out/i })` ambiguous in several existing tests) has
                  room at 360px without the header wrapping.
                */}
                <p className="hidden text-sm text-slate-500 sm:block">
                  <span className="font-medium text-slate-700">{user.email}</span>
                  <span> · {ROLE_LABELS[user.role] ?? user.role}</span>
                </p>
                <Button
                  variant="ghost"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Button>
              </div>
            ) : null}

            {user ? (
              <button
                ref={menuButtonRef}
                type="button"
                aria-expanded={mobileNavOpen}
                aria-controls="primary-navigation"
                onClick={() => setMobileNavOpen((open) => !open)}
                className="inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 md:hidden"
              >
                <span className="sr-only">
                  {mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                </span>
                <MenuGlyph open={mobileNavOpen} />
              </button>
            ) : null}
          </div>
        </div>

        {/*
          Backdrop: mobile/tablet only, and only while the drawer is open.
          Clicking it closes the drawer, same as Escape.
        */}
        {mobileNavOpen ? (
          <div
            aria-hidden="true"
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          />
        ) : null}

        {/*
          One `<nav aria-label="Main">` instance, always — its CONTAINER is
          what changes shape by breakpoint, never its content. Below `md` it
          is a fixed, off-canvas slide-in panel toggled by `mobileNavOpen`;
          at `md` and up it becomes a static inline row and the drawer
          classes (position/transform/backdrop) stop applying. A second,
          duplicated nav instance for "mobile" would be the obvious
          alternative, but every test that queries
          `getByRole('navigation', { name: 'Main' })` (several files) and
          every test that clicks a specific nav link by name expects
          exactly one match — jsdom applies no CSS, so two coexisting nav
          instances would make those queries ambiguous rather than merely
          duplicating an off-screen node, which is why this stays one
          instance repositioned by class, not two.
        */}
        <div
          id="primary-navigation"
          // `invisible` (not just the off-screen transform) when closed:
          // `visibility: hidden` also drops the panel's links out of tab
          // order, so a keyboard user tabbing past the hamburger button
          // doesn't land on off-screen content. `md:visible` unconditionally
          // restores it for the desktop row, where `mobileNavOpen` is
          // irrelevant.
          className={`fixed inset-y-0 right-0 z-40 w-72 max-w-[85vw] transform overflow-y-auto bg-white p-4 shadow-popover transition-transform duration-200 ease-out ${
            mobileNavOpen ? 'visible translate-x-0' : 'invisible translate-x-full'
          } md:visible md:static md:inset-auto md:z-auto md:w-auto md:max-w-none md:translate-x-0 md:transform-none md:overflow-visible md:border-t md:border-slate-100 md:bg-transparent md:p-0 md:shadow-none`}
        >
          <nav ref={navRef} aria-label="Main">
            <ul className="flex flex-col gap-1 md:mx-auto md:max-w-7xl md:flex-row md:items-center md:gap-1 md:px-4 md:py-2 lg:px-8">
              <li>
                <NavLink to="/tickets" end className={navLinkClassName}>
                  Tickets
                </NavLink>
              </li>
              <li>
                <NavLink to="/tickets/new" className={navLinkClassName}>
                  New ticket
                </NavLink>
              </li>
              <li>
                <NavLink to="/assets" className={navLinkClassName}>
                  {/* D3: an Employee's list is already row-scoped to their
                      own assigned equipment, so the label reflects that
                      rather than implying a full inventory view. */}
                  {isStaff ? 'Assets' : 'My assets'}
                </NavLink>
              </li>
              <li>
                <NavLink to="/kb" className={navLinkClassName}>
                  {/* Visible to every role, unlike SLA: an Employee needs
                      the knowledge base most of all — searching it is the
                      self-service half of the product. The label does not
                      change by role because the list itself does not: what
                      differs is only that an Employee sees Published
                      articles. */}
                  Knowledge base
                </NavLink>
              </li>
              {/* The SLA dashboard is staff-only; the route itself renders
                  "page not found" for anyone else. */}
              {isStaff ? (
                <li>
                  <NavLink to="/sla" className={navLinkClassName}>
                    SLA
                  </NavLink>
                </li>
              ) : null}
              {/* Staff-only, like SLA; the route renders "page not found"
                  for anyone else. */}
              {isStaff ? (
                <li>
                  <NavLink to="/dashboard" className={navLinkClassName}>
                    Dashboard
                  </NavLink>
                </li>
              ) : null}
              {/* Administrator-only; the route renders "page not found"
                  for anyone else, and the backend enforces it. */}
              {canViewAudit ? (
                <li>
                  <NavLink to="/audit" className={navLinkClassName}>
                    Audit log
                  </NavLink>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      >
        {/*
          Scoped to the routed page, not the whole shell, so a page that
          throws during render leaves the navigation and sign-out working.
          Keyed on the pathname so navigating away clears the error.
        */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
