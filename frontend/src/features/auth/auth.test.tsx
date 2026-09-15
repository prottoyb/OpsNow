import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockState, resetMockState } from '../../mocks/handlers';
import { agentUser, employeeUser, makeTicket } from '../../mocks/fixtures';
import { server } from '../../mocks/server';
import { getAccessToken } from '../../lib/api/client';
import { renderApp } from '../../test/renderApp';

const BASE = '*/api/v1';

describe('session bootstrap', () => {
  it('recovers the session from the refresh cookie on a cold load', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/tickets' });

    expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument();
    // The shell shows email + role only — never the user's name, because
    // GET /auth/me does not return one.
    expect(screen.getByText(employeeUser.email)).toBeInTheDocument();
    expect(screen.getByText(/Employee/)).toBeInTheDocument();
    expect(mockState.refreshCount).toBe(1);
  });

  it('shows a loading state while the bootstrap refresh is in flight', async () => {
    resetMockState({ currentUser: employeeUser });

    renderApp({ route: '/tickets' });

    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
    await screen.findByRole('heading', { name: 'Tickets' });
  });

  it('lands on the login page when the refresh cookie is not accepted', async () => {
    resetMockState({ refreshSucceeds: false });

    renderApp({ route: '/tickets' });

    expect(
      await screen.findByRole('heading', { name: /sign in to opsnow/i }),
    ).toBeInTheDocument();
  });

  it('treats a failing /auth/me as an unauthenticated session', async () => {
    resetMockState({ currentUser: employeeUser });
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    renderApp({ route: '/tickets' });

    expect(
      await screen.findByRole('heading', { name: /sign in to opsnow/i }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });
});

describe('ProtectedRoute', () => {
  it('redirects an unauthenticated visitor and remembers the destination', async () => {
    resetMockState({ refreshSucceeds: false });
    const user = userEvent.setup();

    renderApp({ route: '/tickets/new' });

    await screen.findByRole('heading', { name: /sign in to opsnow/i });

    // Signing in must land on the page that was originally requested.
    mockState.refreshSucceeds = true;
    mockState.currentUser = employeeUser;
    await user.type(screen.getByLabelText(/email address/i), employeeUser.email);
    await user.type(screen.getByLabelText(/password/i), 'DevPassword123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByRole('heading', { name: /new ticket/i }),
    ).toBeInTheDocument();
  });
});

describe('login', () => {
  it('renders the backend message when credentials are rejected', async () => {
    resetMockState({ refreshSucceeds: false });
    const user = userEvent.setup();

    renderApp({ route: '/login' });
    await screen.findByRole('heading', { name: /sign in to opsnow/i });

    await user.type(screen.getByLabelText(/email address/i), employeeUser.email);
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('requires both fields before making a request', async () => {
    resetMockState({ refreshSucceeds: false });
    const user = userEvent.setup();

    renderApp({ route: '/login' });
    await screen.findByRole('heading', { name: /sign in to opsnow/i });

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText(/enter your email address and password/i),
    ).toBeInTheDocument();
  });

  it('redirects an already-authenticated visitor away from /login', async () => {
    resetMockState({ currentUser: agentUser });

    renderApp({ route: '/login' });

    expect(
      await screen.findByRole('heading', { name: 'Tickets' }),
    ).toBeInTheDocument();
  });
});

describe('logout', () => {
  it('clears the query cache and returns to the login page', async () => {
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });
    const user = userEvent.setup();

    const { queryClient } = renderApp({ route: '/tickets' });

    await screen.findByRole('heading', { name: 'Tickets' });
    await waitFor(() =>
      expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0),
    );

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(
      await screen.findByRole('heading', { name: /sign in to opsnow/i }),
    ).toBeInTheDocument();
    // A staff user's cached tickets (and their internal notes) must not be
    // left in memory for whoever signs in next on this browser.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(getAccessToken()).toBeNull();
  });

  it('clears the cache on sign-in, so data from a previous user cannot survive', async () => {
    /*
      The confidentiality invariant of this phase, pinned at the unit level.

      Sign-out already clears the cache (above), but sign-in clears it too, and
      that is the half that matters if anything ever leaves data behind: a
      support agent's cached comments include internal notes, and the next
      person to sign in on the same browser may be an Employee who must never
      see them. Query keys are namespaced by user id as well, so this is
      defence in depth — which is exactly why it needs its own test rather
      than relying on the namespacing to make it unobservable.
    */
    resetMockState({ currentUser: agentUser, tickets: [makeTicket()] });
    const user = userEvent.setup();

    const { queryClient } = renderApp({ route: '/tickets' });
    await screen.findByRole('heading', { name: 'Tickets' });
    await waitFor(() =>
      expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0),
    );

    // Seed a marker entry that survives only if the cache is never cleared.
    queryClient.setQueryData(['leak-canary'], 'internal note from the agent');
    expect(queryClient.getQueryData(['leak-canary'])).toBeDefined();

    await user.click(screen.getByRole('button', { name: /sign out/i }));
    await screen.findByRole('heading', { name: /sign in to opsnow/i });

    // Now sign in as a DIFFERENT user.
    mockState.currentUser = employeeUser;
    await user.type(screen.getByLabelText(/email/i), employeeUser.email);
    await user.type(screen.getByLabelText(/password/i), 'DevPassword123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await screen.findByRole('heading', { name: 'Tickets' });
    expect(queryClient.getQueryData(['leak-canary'])).toBeUndefined();
  });

  it('clears local session state even when the logout request fails', async () => {
    resetMockState({ currentUser: agentUser });
    server.use(
      http.post(`${BASE}/auth/logout`, () =>
        HttpResponse.json({ statusCode: 500, message: 'boom' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();

    renderApp({ route: '/tickets' });
    await screen.findByRole('heading', { name: 'Tickets' });

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(
      await screen.findByRole('heading', { name: /sign in to opsnow/i }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });
});

describe('session expiry', () => {
  it('sends the user to the login page with a notice when the refresh fails mid-session', async () => {
    resetMockState({ currentUser: agentUser });

    renderApp({ route: '/tickets' });
    await screen.findByRole('heading', { name: 'Tickets' });

    // The access token is rejected and the refresh cookie is gone too.
    mockState.refreshSucceeds = false;
    server.use(
      http.get(`${BASE}/tickets`, () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    // Scoped to the header nav: "New ticket" also appears as a page action.
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    const user = userEvent.setup();
    await user.click(nav.getByRole('link', { name: /^new ticket$/i }));
    await user.click(nav.getByRole('link', { name: /^tickets$/i }));

    expect(
      await screen.findByText(/your session expired/i),
    ).toBeInTheDocument();
  });
});
