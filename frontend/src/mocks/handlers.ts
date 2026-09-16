import { HttpResponse, http } from 'msw';
import type {
  AuthenticatedUser,
  SlaMetrics,
  SlaPolicy,
  Ticket,
  TicketCategory,
  TicketComment,
  TicketHistoryEntry,
} from '../types/api';
import { isStaffRole } from '../types/api';
import {
  agentUser,
  categories as defaultCategories,
  employeeUser,
  makeTicket,
  slaMetrics as defaultSlaMetrics,
  slaPolicies as defaultSlaPolicies,
} from './fixtures';

/**
 * Test-only MSW handlers (`msw/node` + `setupServer`).
 *
 * This module is never imported by application code — `src/test/guards.test.ts`
 * asserts that, so the mock API can never be bundled into the real app. The
 * browser service worker (`msw/browser`/`setupWorker`) is deliberately not
 * used anywhere in this project.
 *
 * The role-based filtering reproduced below mirrors the backend only so the
 * UI can be exercised. It is emphatically NOT the security boundary — the
 * real one is in `backend/src/tickets/tickets.service.ts`.
 */

const BASE = '*/api/v1';

export interface MockState {
  currentUser: AuthenticatedUser | null;
  accessToken: string;
  /** Number of times `POST /auth/refresh` has been called. */
  refreshCount: number;
  refreshSucceeds: boolean;
  tickets: Ticket[];
  comments: TicketComment[];
  history: TicketHistoryEntry[];
  categories: TicketCategory[];
  slaPolicies: SlaPolicy[];
  slaMetrics: SlaMetrics;
}

export const mockState: MockState = createInitialState();

function createInitialState(): MockState {
  return {
    currentUser: employeeUser,
    accessToken: 'token-1',
    refreshCount: 0,
    refreshSucceeds: true,
    tickets: [makeTicket()],
    comments: [],
    history: [],
    categories: [...defaultCategories],
    slaPolicies: [...defaultSlaPolicies],
    slaMetrics: { ...defaultSlaMetrics },
  };
}

export function resetMockState(overrides: Partial<MockState> = {}): void {
  Object.assign(mockState, createInitialState(), overrides);
}

function badRequest(messages: string | string[], path: string) {
  return HttpResponse.json(
    {
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path,
      message: messages,
    },
    { status: 400 },
  );
}

function errorResponse(status: number, message: string, path: string) {
  return HttpResponse.json(
    { statusCode: status, timestamp: new Date().toISOString(), path, message },
    { status },
  );
}

function requireUser(request: Request): AuthenticatedUser | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  if (header.slice('Bearer '.length) !== mockState.accessToken) {
    return null;
  }
  return mockState.currentUser;
}

/** Mirrors `ticketVisibilityWhere` — an Employee only ever sees own tickets. */
function visibleTickets(user: AuthenticatedUser): Ticket[] {
  if (isStaffRole(user.role)) {
    return mockState.tickets;
  }
  return mockState.tickets.filter((t) => t.requester.id === user.id);
}

function findVisibleTicket(user: AuthenticatedUser, id: string): Ticket | null {
  return visibleTickets(user).find((t) => t.id === id) ?? null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Everything except the two staff-only SLA routes.
 *
 * Exported separately so a test can run the app with the SLA routes
 * deliberately UNHANDLED: `src/test/setup.ts` starts MSW with
 * `onUnhandledRequest: 'error'`, so a stray request from a non-staff user's
 * app fails loudly instead of quietly succeeding against a mock.
 */
export const coreHandlers = [
  /* ---------------------------- auth ---------------------------- */

  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const user =
      body.email === agentUser.email
        ? agentUser
        : body.email === employeeUser.email
          ? employeeUser
          : null;

    if (!user || body.password !== 'DevPassword123!') {
      return errorResponse(401, 'Invalid credentials', '/api/v1/auth/login');
    }

    mockState.currentUser = user;
    return HttpResponse.json({
      accessToken: mockState.accessToken,
      user: { ...user, firstName: 'Test', lastName: 'User' },
    });
  }),

  http.post(`${BASE}/auth/refresh`, () => {
    mockState.refreshCount += 1;
    if (!mockState.refreshSucceeds || !mockState.currentUser) {
      return errorResponse(401, 'Invalid refresh token', '/api/v1/auth/refresh');
    }
    mockState.accessToken = `token-${mockState.refreshCount + 1}`;
    return HttpResponse.json({ accessToken: mockState.accessToken });
  }),

  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${BASE}/auth/me`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/auth/me');
    }
    return HttpResponse.json(user);
  }),

  /* ------------------------- categories ------------------------- */

  http.get(`${BASE}/ticket-categories`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/ticket-categories');
    }
    // Bare array, not a {data,total} envelope.
    return HttpResponse.json(mockState.categories.filter((c) => c.isActive));
  }),

  /* --------------------------- tickets -------------------------- */

  http.get(`${BASE}/tickets`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const categoryId = url.searchParams.get('categoryId');
    const assigneeId = url.searchParams.get('assigneeId');
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const filtered = visibleTickets(user).filter(
      (t) =>
        (!status || t.status === status) &&
        (!priority || t.priority === priority) &&
        (!categoryId || t.category?.id === categoryId) &&
        (!assigneeId || t.assignee?.id === assigneeId),
    );

    return HttpResponse.json({
      data: filtered.slice(offset, offset + limit),
      total: filtered.length,
    });
  }),

  http.post(`${BASE}/tickets`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }

    const body = (await request.json()) as Record<string, unknown>;
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';

    const messages: string[] = [];
    if (subject === '') messages.push('subject should not be empty');
    if (description === '') messages.push('description should not be empty');
    if (messages.length > 0) {
      return badRequest(messages, '/api/v1/tickets');
    }

    const category =
      typeof body.categoryId === 'string'
        ? (mockState.categories.find((c) => c.id === body.categoryId) ?? null)
        : null;

    const ticket = makeTicket({
      id: `f${String(mockState.tickets.length + 1).padStart(7, '0')}-1111-4111-8111-111111111111`,
      ticketNumber: 2000 + mockState.tickets.length,
      subject,
      description,
      category,
      priority:
        typeof body.priority === 'string'
          ? (body.priority as Ticket['priority'])
          : 'Medium',
      requester: {
        id: user.id,
        firstName: 'Test',
        lastName: 'User',
        role: user.role,
      },
    });
    mockState.tickets = [ticket, ...mockState.tickets];
    return HttpResponse.json(ticket, { status: 201 });
  }),

  http.get(`${BASE}/tickets/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    if (!UUID_RE.test(id)) {
      // ParseUUIDPipe rejects before the handler runs: 400, not 404.
      return badRequest(
        'Validation failed (uuid is expected)',
        `/api/v1/tickets/${id}`,
      );
    }
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    return HttpResponse.json(ticket);
  }),

  http.patch(`${BASE}/tickets/:id`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    if (!isStaffRole(user.role) && ticket.status !== 'New') {
      return errorResponse(
        403,
        'This ticket can no longer be edited by its requester',
        `/api/v1/tickets/${id}`,
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const updated: Ticket = {
      ...ticket,
      subject: typeof body.subject === 'string' ? body.subject : ticket.subject,
      description:
        typeof body.description === 'string'
          ? body.description
          : ticket.description,
      category:
        typeof body.categoryId === 'string'
          ? (mockState.categories.find((c) => c.id === body.categoryId) ?? null)
          : ticket.category,
    };
    mockState.tickets = mockState.tickets.map((t) =>
      t.id === id ? updated : t,
    );
    return HttpResponse.json(updated);
  }),

  http.patch(`${BASE}/tickets/:id/status`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    const body = (await request.json()) as { status?: Ticket['status'] };
    const next = body.status;
    if (!next) {
      return badRequest('status must be a valid enum value', `/api/v1/tickets/${id}`);
    }
    const reopening = ticket.status === 'Resolved' && next === 'Open';
    if (!isStaffRole(user.role) && !reopening) {
      return errorResponse(
        403,
        'Only staff can change a ticket to this status',
        `/api/v1/tickets/${id}`,
      );
    }
    const updated: Ticket = { ...ticket, status: next };
    mockState.tickets = mockState.tickets.map((t) => (t.id === id ? updated : t));
    return HttpResponse.json(updated);
  }),

  http.patch(`${BASE}/tickets/:id/priority`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(403, 'Forbidden resource', `/api/v1/tickets/${id}`);
    }
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    const body = (await request.json()) as { priority?: Ticket['priority'] };
    const updated: Ticket = {
      ...ticket,
      priority: body.priority ?? ticket.priority,
    };
    mockState.tickets = mockState.tickets.map((t) => (t.id === id ? updated : t));
    return HttpResponse.json(updated);
  }),

  http.patch(`${BASE}/tickets/:id/assignment`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(403, 'Forbidden resource', `/api/v1/tickets/${id}`);
    }
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    const body = (await request.json()) as { assigneeId?: string | null };
    if (body.assigneeId === undefined) {
      return badRequest('assigneeId must be a UUID', `/api/v1/tickets/${id}`);
    }
    const updated: Ticket = {
      ...ticket,
      assignee:
        body.assigneeId === null
          ? null
          : {
              id: body.assigneeId,
              firstName: 'Test',
              lastName: 'User',
              role: user.role,
            },
    };
    mockState.tickets = mockState.tickets.map((t) => (t.id === id ? updated : t));
    return HttpResponse.json(updated);
  }),

  /* -------------------------- comments -------------------------- */

  http.get(`${BASE}/tickets/:id/comments`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    // Internal notes are excluded from BOTH rows and total for a non-staff
    // caller, exactly as the backend does — the count would otherwise leak
    // how many internal notes exist.
    const visible = mockState.comments.filter(
      (c) => isStaffRole(user.role) || c.visibility === 'Public',
    );
    return HttpResponse.json({ data: visible, total: visible.length });
  }),

  http.post(`${BASE}/tickets/:id/comments`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    const body = (await request.json()) as {
      body?: string;
      visibility?: TicketComment['visibility'];
    };
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (text === '') {
      return badRequest(
        'body should not be empty',
        `/api/v1/tickets/${id}/comments`,
      );
    }
    const visibility = body.visibility ?? 'Public';
    if (visibility === 'Internal' && !isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can create an internal note',
        `/api/v1/tickets/${id}/comments`,
      );
    }
    const comment: TicketComment = {
      id: `d${String(mockState.comments.length + 2).padStart(7, '0')}-1111-4111-8111-111111111111`,
      body: text,
      visibility,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: user.id,
        firstName: 'Test',
        lastName: 'User',
        role: user.role,
      },
    };
    mockState.comments = [...mockState.comments, comment];
    return HttpResponse.json(comment, { status: 201 });
  }),

  /* --------------------------- history -------------------------- */

  http.get(`${BASE}/tickets/:id/history`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(403, 'Forbidden resource', `/api/v1/tickets/${id}`);
    }
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    return HttpResponse.json({
      data: mockState.history,
      total: mockState.history.length,
    });
  }),
];

/* ------------------------------- sla ------------------------------- */

export const slaHandlers = [
  /*
   * Both routes are staff-only on the backend (`@Roles(...STAFF_ROLES)` plus
   * `SlaService.assertStaff`). The 403 is reproduced here so a test that
   * deliberately calls them as an Employee sees the real answer — but the
   * app is built never to ask: `useSlaPolicies`/`useSlaMetrics` are disabled
   * for a non-staff user, and MSW's `onUnhandledRequest: 'error'` would fail
   * the test if anything slipped through.
   */

  http.get(`${BASE}/sla-policies`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/sla-policies');
    }
    if (!isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can access SLA data',
        '/api/v1/sla-policies',
      );
    }
    // Bare array, not a {data,total} envelope.
    return HttpResponse.json(mockState.slaPolicies);
  }),

  http.get(`${BASE}/sla/metrics`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/sla/metrics');
    }
    if (!isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can access SLA data',
        '/api/v1/sla/metrics',
      );
    }
    return HttpResponse.json(mockState.slaMetrics);
  }),
];

export const handlers = [...coreHandlers, ...slaHandlers];
