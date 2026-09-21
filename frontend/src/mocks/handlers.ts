import { HttpResponse, http } from 'msw';
import type {
  AgentAnalytics,
  ArticleFeedbackSummary,
  Asset,
  AssetAssignment,
  AssetStatus,
  AssetType,
  AuthenticatedUser,
  CategoryAnalytics,
  KnowledgeArticle,
  KnowledgeArticleStatus,
  KnowledgeBaseCategory,
  SlaAnalytics,
  SlaMetrics,
  SlaPolicy,
  Ticket,
  TicketAnalytics,
  TicketAsset,
  TicketCategory,
  TicketComment,
  TicketHistoryEntry,
  TicketKnowledgeArticle,
} from '../types/api';
import { isAnalyticsAgentRole, isStaffRole } from '../types/api';
import type { MockArticleFeedback } from './fixtures';
import {
  agentAnalytics as defaultAgentAnalytics,
  agentUser,
  assetTypes as defaultAssetTypes,
  categories as defaultCategories,
  categoryAnalytics as defaultCategoryAnalytics,
  employeeUser,
  kbCategories as defaultKbCategories,
  makeArticle,
  makeAsset,
  makeTicket,
  slaAnalytics as defaultSlaAnalytics,
  slaMetrics as defaultSlaMetrics,
  slaPolicies as defaultSlaPolicies,
  ticketAnalytics as defaultTicketAnalytics,
  toArticleSummary,
} from './fixtures';

/**
 * Mirrors `UNASSIGNABLE_STATUSES` in `backend/src/assets/assets.constants.ts` —
 * an asset in one of these statuses cannot be assigned to anyone (it is not
 * physically available), but can always be returned to stock.
 */
const UNASSIGNABLE_STATUSES: readonly AssetStatus[] = [
  'InRepair',
  'Retired',
  'Lost',
];

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
  assets: Asset[];
  assetTypes: AssetType[];
  assetAssignments: AssetAssignment[];
  ticketAssets: TicketAsset[];
  /** Full articles; the list/link routes derive the summary projection. */
  articles: KnowledgeArticle[];
  kbCategories: KnowledgeBaseCategory[];
  /** Every stored vote, across every article. */
  articleFeedback: MockArticleFeedback[];
  ticketArticles: TicketKnowledgeArticle[];
  ticketAnalytics: TicketAnalytics;
  slaAnalytics: SlaAnalytics;
  categoryAnalytics: CategoryAnalytics;
  agentAnalytics: AgentAnalytics;
  /**
   * Every `GET /analytics/*` request the mock served, in order, with its
   * query string. Lets a test assert what the UI actually asked for — and,
   * for a role that must not ask, that nothing was requested at all.
   */
  analyticsRequests: { route: string; params: URLSearchParams }[];
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
    assets: [makeAsset()],
    assetTypes: [...defaultAssetTypes],
    assetAssignments: [],
    ticketAssets: [],
    articles: [makeArticle()],
    kbCategories: [...defaultKbCategories],
    articleFeedback: [],
    ticketArticles: [],
    ticketAnalytics: structuredClone(defaultTicketAnalytics),
    slaAnalytics: structuredClone(defaultSlaAnalytics),
    categoryAnalytics: structuredClone(defaultCategoryAnalytics),
    agentAnalytics: structuredClone(defaultAgentAnalytics),
    analyticsRequests: [],
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

/** Mirrors `assetVisibilityWhere` — an Employee only ever sees assets currently assigned to them. */
function visibleAssets(user: AuthenticatedUser): Asset[] {
  if (isStaffRole(user.role)) {
    return mockState.assets;
  }
  return mockState.assets.filter((a) => a.currentAssignee?.id === user.id);
}

function findVisibleAsset(user: AuthenticatedUser, id: string): Asset | null {
  return visibleAssets(user).find((a) => a.id === id) ?? null;
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

/* ------------------------------- assets ------------------------------- */

/**
 * Read routes are open to any authenticated user but row-scoped (an Employee
 * only ever sees the assets currently assigned to them, mirroring
 * `assetVisibilityWhere`). Every mutating route is staff-only, reproduced
 * here purely to exercise the UI — the real boundary is
 * `backend/src/assets/assets.service.ts`.
 */
export const assetHandlers = [
  http.get(`${BASE}/asset-types`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/asset-types');
    }
    // Bare array, not a {data,total} envelope.
    return HttpResponse.json(mockState.assetTypes.filter((t) => t.isActive));
  }),

  http.get(`${BASE}/assets`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/assets');
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const assetTypeId = url.searchParams.get('assetTypeId');
    const assigneeId = url.searchParams.get('assigneeId');
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const filtered = visibleAssets(user).filter(
      (a) =>
        (!status || a.status === status) &&
        (!assetTypeId || a.assetType.id === assetTypeId) &&
        (!assigneeId || a.currentAssignee?.id === assigneeId) &&
        (!q ||
          a.assetTag.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.serialNumber?.toLowerCase().includes(q) ?? false)),
    );

    return HttpResponse.json({
      data: filtered.slice(offset, offset + limit),
      total: filtered.length,
    });
  }),

  http.post(`${BASE}/assets`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/assets');
    }
    if (!isStaffRole(user.role)) {
      return errorResponse(403, 'Only staff can create an asset', '/api/v1/assets');
    }

    const body = (await request.json()) as Record<string, unknown>;
    const assetTag = typeof body.assetTag === 'string' ? body.assetTag.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const assetTypeId =
      typeof body.assetTypeId === 'string' ? body.assetTypeId : '';

    const messages: string[] = [];
    if (assetTag === '') messages.push('assetTag should not be empty');
    if (name === '') messages.push('name should not be empty');
    const assetType = mockState.assetTypes.find((t) => t.id === assetTypeId);
    if (!assetType) {
      messages.push('assetTypeId does not refer to an active asset type');
    }
    if (messages.length > 0) {
      return badRequest(messages, '/api/v1/assets');
    }

    const asset = makeAsset({
      id: `7${String(mockState.assets.length + 1).padStart(7, '0')}-1111-4111-8111-111111111111`,
      assetTag,
      name,
      assetType,
      status: 'InStock',
      currentAssignee: null,
      serialNumber:
        typeof body.serialNumber === 'string' ? body.serialNumber : null,
      purchaseDate:
        typeof body.purchaseDate === 'string' ? body.purchaseDate : null,
      warrantyExpiresAt:
        typeof body.warrantyExpiresAt === 'string'
          ? body.warrantyExpiresAt
          : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });
    mockState.assets = [asset, ...mockState.assets];
    return HttpResponse.json(asset, { status: 201 });
  }),

  http.get(`${BASE}/assets/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/assets');
    }
    const id = String(params.id);
    if (!UUID_RE.test(id)) {
      // ParseUUIDPipe rejects before the handler runs: 400, not 404.
      return badRequest(
        'Validation failed (uuid is expected)',
        `/api/v1/assets/${id}`,
      );
    }
    const asset = findVisibleAsset(user, id);
    if (!asset) {
      return errorResponse(404, 'Asset not found', `/api/v1/assets/${id}`);
    }
    return HttpResponse.json(asset);
  }),

  http.patch(`${BASE}/assets/:id`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/assets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(403, 'Only staff can update an asset', `/api/v1/assets/${id}`);
    }
    const asset = findVisibleAsset(user, id);
    if (!asset) {
      return errorResponse(404, 'Asset not found', `/api/v1/assets/${id}`);
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Validated whenever the key is present at all — including a value
    // equal to the current status — mirroring
    // `assertNonAssignmentStatusChange`.
    if ('status' in body) {
      if (body.status === 'Assigned') {
        return badRequest(
          'Assign an asset through PATCH /assets/:id/assignment, not by setting status',
          `/api/v1/assets/${id}`,
        );
      }
      if (asset.currentAssignee !== null) {
        return badRequest(
          `Asset is currently assigned; return it through PATCH /assets/:id/assignment before changing its status to ${String(body.status)}`,
          `/api/v1/assets/${id}`,
        );
      }
    }

    const assetType = body.assetTypeId
      ? mockState.assetTypes.find((t) => t.id === body.assetTypeId)
      : undefined;

    const updated: Asset = {
      ...asset,
      name: typeof body.name === 'string' ? body.name : asset.name,
      assetType: assetType ?? asset.assetType,
      status: typeof body.status === 'string' ? (body.status as AssetStatus) : asset.status,
      serialNumber:
        'serialNumber' in body
          ? ((body.serialNumber as string | null) ?? null)
          : asset.serialNumber,
      notes: 'notes' in body ? ((body.notes as string | null) ?? null) : asset.notes,
      purchaseDate:
        'purchaseDate' in body
          ? ((body.purchaseDate as string | null) ?? null)
          : asset.purchaseDate,
      warrantyExpiresAt:
        'warrantyExpiresAt' in body
          ? ((body.warrantyExpiresAt as string | null) ?? null)
          : asset.warrantyExpiresAt,
    };
    mockState.assets = mockState.assets.map((a) => (a.id === id ? updated : a));
    return HttpResponse.json(updated);
  }),

  http.patch(`${BASE}/assets/:id/assignment`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/assets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can change an asset assignment',
        `/api/v1/assets/${id}`,
      );
    }
    const asset = findVisibleAsset(user, id);
    if (!asset) {
      return errorResponse(404, 'Asset not found', `/api/v1/assets/${id}`);
    }

    const body = (await request.json()) as {
      assignedToId?: string | null;
      notes?: string;
    };
    if (body.assignedToId === undefined) {
      return badRequest('assignedToId must be a UUID', `/api/v1/assets/${id}`);
    }

    const expectedAssigneeId = asset.currentAssignee?.id ?? null;

    if (body.assignedToId === expectedAssigneeId) {
      if (body.notes !== undefined) {
        return badRequest(
          expectedAssigneeId === null
            ? 'Asset is already unassigned'
            : 'Asset is already assigned to this user',
          `/api/v1/assets/${id}`,
        );
      }
      return HttpResponse.json(asset);
    }

    if (body.assignedToId && UNASSIGNABLE_STATUSES.includes(asset.status)) {
      return badRequest(
        `An asset in status ${asset.status} cannot be assigned; move it back to stock first`,
        `/api/v1/assets/${id}`,
      );
    }

    const now = new Date().toISOString();

    // Close whatever the ledger still has open for this asset.
    mockState.assetAssignments = mockState.assetAssignments.map((entry) =>
      entry.assetId === id && entry.returnedAt === null
        ? { ...entry, returnedAt: now }
        : entry,
    );

    const updated: Asset = {
      ...asset,
      status: body.assignedToId ? 'Assigned' : 'InStock',
      currentAssignee: body.assignedToId
        ? { id: body.assignedToId, firstName: 'Test', lastName: 'User', role: 'Employee' }
        : null,
      updatedAt: now,
    };
    mockState.assets = mockState.assets.map((a) => (a.id === id ? updated : a));

    if (body.assignedToId && updated.currentAssignee) {
      mockState.assetAssignments = [
        {
          id: `8${String(mockState.assetAssignments.length + 1).padStart(7, '0')}-1111-4111-8111-111111111111`,
          assetId: id,
          assignedAt: now,
          returnedAt: null,
          notes: body.notes ?? null,
          assignedTo: updated.currentAssignee,
          assignedBy: {
            id: user.id,
            firstName: 'Test',
            lastName: 'User',
            role: user.role,
          },
        },
        ...mockState.assetAssignments,
      ];
    }

    return HttpResponse.json(updated);
  }),

  http.get(`${BASE}/assets/:id/assignments`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/assets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(403, 'Forbidden resource', `/api/v1/assets/${id}`);
    }
    const asset = findVisibleAsset(user, id);
    if (!asset) {
      return errorResponse(404, 'Asset not found', `/api/v1/assets/${id}`);
    }
    const entries = mockState.assetAssignments.filter((e) => e.assetId === id);
    return HttpResponse.json({ data: entries, total: entries.length });
  }),

  /* ----------------------- ticket <-> asset links ----------------------- */

  http.get(`${BASE}/tickets/:id/assets`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    // Bare, unpaginated array.
    return HttpResponse.json(
      mockState.ticketAssets.filter((link) => link.ticketId === id),
    );
  }),

  http.post(`${BASE}/tickets/:id/assets`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can link an asset to a ticket',
        `/api/v1/tickets/${id}/assets`,
      );
    }
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    const body = (await request.json()) as { assetId?: string };
    const asset = mockState.assets.find((a) => a.id === body.assetId);
    if (!asset) {
      return badRequest(
        'assetId does not refer to an existing asset',
        `/api/v1/tickets/${id}/assets`,
      );
    }

    const existing = mockState.ticketAssets.find(
      (link) => link.ticketId === id && link.asset.id === asset.id,
    );
    if (existing) {
      // Idempotent: re-linking returns the existing link.
      return HttpResponse.json(existing, { status: 201 });
    }

    const link: TicketAsset = {
      ticketId: id,
      linkedAt: new Date().toISOString(),
      linkedBy: { id: user.id, firstName: 'Test', lastName: 'User', role: user.role },
      asset: {
        id: asset.id,
        assetTag: asset.assetTag,
        name: asset.name,
        status: asset.status,
        assetType: asset.assetType,
      },
    };
    mockState.ticketAssets = [link, ...mockState.ticketAssets];
    return HttpResponse.json(link, { status: 201 });
  }),

  http.delete(`${BASE}/tickets/:id/assets/:assetId`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    if (!isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can unlink an asset from a ticket',
        `/api/v1/tickets/${id}/assets`,
      );
    }
    const assetId = String(params.assetId);
    // Idempotent: unlinking something that is not linked still succeeds.
    mockState.ticketAssets = mockState.ticketAssets.filter(
      (link) => !(link.ticketId === id && link.asset.id === assetId),
    );
    return new HttpResponse(null, { status: 204 });
  }),
];

/* --------------------------- knowledge base --------------------------- */

/**
 * Mirrors `knowledgeArticleVisibilityWhere` — an Employee only ever sees
 * PUBLISHED articles; staff see every article in any status. An out-of-scope
 * article is a 404 and never a 403: a draft's mere existence is information
 * about what the support team is working on.
 */
function visibleArticles(user: AuthenticatedUser): KnowledgeArticle[] {
  if (isStaffRole(user.role)) {
    return mockState.articles;
  }
  return mockState.articles.filter((a) => a.status === 'Published');
}

function findVisibleArticle(
  user: AuthenticatedUser,
  id: string,
): KnowledgeArticle | null {
  return visibleArticles(user).find((a) => a.id === id) ?? null;
}

/**
 * The two aggregate counts plus the CALLER'S OWN vote — never anyone else's
 * comment. Derived from the stored votes so a vote and the counts can never
 * drift apart in a test.
 */
function feedbackSummaryFor(
  articleId: string,
  user: AuthenticatedUser,
): ArticleFeedbackSummary {
  const rows = mockState.articleFeedback.filter(
    (f) => f.articleId === articleId,
  );
  const mine = rows.find((f) => f.user.id === user.id);
  return {
    helpfulCount: rows.filter((f) => f.isHelpful).length,
    notHelpfulCount: rows.filter((f) => !f.isHelpful).length,
    myFeedback: mine
      ? {
          isHelpful: mine.isHelpful,
          comment: mine.comment,
          createdAt: mine.createdAt,
        }
      : null,
  };
}

function articleDetail(
  article: KnowledgeArticle,
  user: AuthenticatedUser,
): KnowledgeArticle {
  return { ...article, feedback: feedbackSummaryFor(article.id, user) };
}

/** Summary projection with the derived counts folded in. */
function articleSummary(article: KnowledgeArticle, user: AuthenticatedUser) {
  return toArticleSummary(articleDetail(article, user));
}

/** Mirrors `ALLOWED_ARTICLE_TRANSITIONS`; same status is an accepted no-op. */
const ALLOWED_ARTICLE_TRANSITIONS: Record<
  KnowledgeArticleStatus,
  readonly KnowledgeArticleStatus[]
> = {
  Draft: ['Published', 'Archived'],
  Published: ['Draft', 'Archived'],
  Archived: ['Draft'],
};

function canChangeStatus(user: AuthenticatedUser): boolean {
  return user.role === 'TeamLead' || user.role === 'Administrator';
}

function canEditAny(user: AuthenticatedUser): boolean {
  return user.role === 'TeamLead' || user.role === 'Administrator';
}

/**
 * Read routes are open to any authenticated user but row-scoped. Authoring is
 * staff-only, with the finer-grained rules `@Roles` cannot express reproduced
 * here purely to exercise the UI — the real boundary is
 * `backend/src/knowledge-base/knowledge-base.service.ts`.
 */
export const knowledgeBaseHandlers = [
  http.get(`${BASE}/kb-categories`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/kb-categories');
    }
    // Bare array, not a {data,total} envelope.
    return HttpResponse.json(mockState.kbCategories.filter((c) => c.isActive));
  }),

  http.get(`${BASE}/kb-articles`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/kb-articles');
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const categoryId = url.searchParams.get('categoryId');
    const status = url.searchParams.get('status');
    const authorId = url.searchParams.get('authorId');
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const offset = Number(url.searchParams.get('offset') ?? '0');

    // Every filter only ever NARROWS the visibility-scoped set, exactly as
    // the backend ANDs its visibility clause in: an Employee asking for
    // `status=Draft` gets an empty page rather than a 403.
    const filtered = visibleArticles(user).filter(
      (a) =>
        (!categoryId || a.category?.id === categoryId) &&
        (!status || a.status === status) &&
        (!authorId || a.author.id === authorId) &&
        (!q ||
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q)),
    );

    return HttpResponse.json({
      data: filtered
        .slice(offset, offset + limit)
        .map((a) => articleSummary(a, user)),
      total: filtered.length,
    });
  }),

  http.post(`${BASE}/kb-articles`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/kb-articles');
    }
    if (!isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can create a knowledge article',
        '/api/v1/kb-articles',
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    const messages: string[] = [];
    if (title === '') messages.push('title should not be empty');
    if (content === '') messages.push('content should not be empty');
    let category: KnowledgeBaseCategory | null = null;
    if (typeof body.categoryId === 'string') {
      category =
        mockState.kbCategories.find(
          (c) => c.id === body.categoryId && c.isActive,
        ) ?? null;
      if (!category) {
        messages.push(
          'categoryId does not refer to an active knowledge base category',
        );
      }
    }
    if (messages.length > 0) {
      return badRequest(messages, '/api/v1/kb-articles');
    }

    const now = new Date().toISOString();
    // Always born Draft, authored by the caller, with a server-derived slug.
    const article = makeArticle({
      id: `6${String(mockState.articles.length + 1).padStart(7, '0')}-1111-4111-8111-111111111111`,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      content,
      status: 'Draft',
      category,
      author: {
        id: user.id,
        firstName: 'Test',
        lastName: 'User',
        role: user.role,
      },
      publishedAt: null,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    mockState.articles = [article, ...mockState.articles];
    return HttpResponse.json(articleDetail(article, user), { status: 201 });
  }),

  http.get(`${BASE}/kb-articles/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/kb-articles');
    }
    const id = String(params.id);
    if (!UUID_RE.test(id)) {
      // ParseUUIDPipe rejects before the handler runs: 400, not 404.
      return badRequest(
        'Validation failed (uuid is expected)',
        `/api/v1/kb-articles/${id}`,
      );
    }
    const article = findVisibleArticle(user, id);
    if (!article) {
      return errorResponse(
        404,
        'Knowledge article not found',
        `/api/v1/kb-articles/${id}`,
      );
    }
    return HttpResponse.json(articleDetail(article, user));
  }),

  http.patch(`${BASE}/kb-articles/:id`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/kb-articles');
    }
    const id = String(params.id);
    const path = `/api/v1/kb-articles/${id}`;
    if (!isStaffRole(user.role)) {
      return errorResponse(
        403,
        'Only staff can update a knowledge article',
        path,
      );
    }
    const article = findVisibleArticle(user, id);
    if (!article) {
      return errorResponse(404, 'Knowledge article not found', path);
    }

    const body = (await request.json()) as Record<string, unknown>;

    // A SupportAgent owns what they wrote; editorial roles may correct
    // anyone's. 403, not 404 — staff can legitimately READ this article.
    if (!canEditAny(user) && article.author.id !== user.id) {
      return errorResponse(
        403,
        'You can only edit knowledge articles you authored',
        path,
      );
    }

    let status = article.status;
    let publishedAt = article.publishedAt;
    if ('status' in body) {
      if (!canChangeStatus(user)) {
        return errorResponse(
          403,
          'Only a TeamLead or Administrator can publish, unpublish or archive a knowledge article',
          path,
        );
      }
      const next = body.status as KnowledgeArticleStatus;
      // Submitting the CURRENT status is an accepted no-op here, unlike a
      // ticket status change.
      if (
        next !== article.status &&
        !ALLOWED_ARTICLE_TRANSITIONS[article.status].includes(next)
      ) {
        return badRequest(
          `A knowledge article cannot move from ${article.status} to ${next}`,
          path,
        );
      }
      status = next;
      if (next === 'Published') publishedAt = new Date().toISOString();
    }

    let category = article.category;
    if ('categoryId' in body) {
      // An explicit null is how an article leaves its category.
      category =
        body.categoryId === null
          ? null
          : (mockState.kbCategories.find((c) => c.id === body.categoryId) ??
            article.category);
    }

    const updated: KnowledgeArticle = {
      ...article,
      title: typeof body.title === 'string' ? body.title : article.title,
      content: typeof body.content === 'string' ? body.content : article.content,
      category,
      status,
      publishedAt,
      updatedAt: new Date().toISOString(),
    };
    mockState.articles = mockState.articles.map((a) =>
      a.id === id ? updated : a,
    );
    return HttpResponse.json(articleDetail(updated, user));
  }),

  http.post(`${BASE}/kb-articles/:id/feedback`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/kb-articles');
    }
    const id = String(params.id);
    const path = `/api/v1/kb-articles/${id}/feedback`;
    // Open to anyone who can SEE the article — including an Employee.
    const article = findVisibleArticle(user, id);
    if (!article) {
      return errorResponse(
        404,
        'Knowledge article not found',
        `/api/v1/kb-articles/${id}`,
      );
    }

    const body = (await request.json()) as {
      isHelpful?: unknown;
      comment?: unknown;
    };
    if (typeof body.isHelpful !== 'boolean') {
      return badRequest('isHelpful must be a boolean value', path);
    }
    const comment =
      typeof body.comment === 'string' ? body.comment.trim() : null;

    // Upsert: a re-vote REPLACES the previous one, and an omitted comment
    // clears whatever note was there.
    const existing = mockState.articleFeedback.find(
      (f) => f.articleId === id && f.user.id === user.id,
    );
    const row: MockArticleFeedback = {
      id:
        existing?.id ??
        `5${String(mockState.articleFeedback.length + 1).padStart(7, '0')}-1111-4111-8111-111111111111`,
      articleId: id,
      isHelpful: body.isHelpful,
      comment,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      user: {
        id: user.id,
        firstName: 'Test',
        lastName: 'User',
        role: user.role,
      },
    };
    mockState.articleFeedback = existing
      ? mockState.articleFeedback.map((f) => (f === existing ? row : f))
      : [...mockState.articleFeedback, row];

    return HttpResponse.json(feedbackSummaryFor(id, user), { status: 201 });
  }),

  http.get(`${BASE}/kb-articles/:id/feedback`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/kb-articles');
    }
    const id = String(params.id);
    const path = `/api/v1/kb-articles/${id}/feedback`;
    // Staff-only: the rows pair free text with the identity of whoever wrote
    // it. The app is built never to ask as an Employee (the query is
    // disabled), and `onUnhandledRequest: 'error'` would catch a slip.
    if (!isStaffRole(user.role)) {
      return errorResponse(403, 'Forbidden resource', path);
    }
    const article = findVisibleArticle(user, id);
    if (!article) {
      return errorResponse(
        404,
        'Knowledge article not found',
        `/api/v1/kb-articles/${id}`,
      );
    }
    const rows = mockState.articleFeedback
      .filter((f) => f.articleId === id)
      .map(({ articleId: _articleId, ...entry }) => entry);
    return HttpResponse.json({ data: rows, total: rows.length });
  }),

  /* ------------------ ticket <-> knowledge-article links ----------------- */

  http.get(`${BASE}/tickets/:id/knowledge-articles`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
    }
    const id = String(params.id);
    const ticket = findVisibleTicket(user, id);
    if (!ticket) {
      return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
    }
    // Bare, unpaginated array, additionally scoped to the caller's ARTICLE
    // visibility — an Employee never learns a Draft is attached.
    const visibleIds = new Set(visibleArticles(user).map((a) => a.id));
    return HttpResponse.json(
      mockState.ticketArticles.filter(
        (link) => link.ticketId === id && visibleIds.has(link.article.id),
      ),
    );
  }),

  http.post(
    `${BASE}/tickets/:id/knowledge-articles`,
    async ({ request, params }) => {
      const user = requireUser(request);
      if (!user) {
        return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
      }
      const id = String(params.id);
      const path = `/api/v1/tickets/${id}/knowledge-articles`;
      if (!isStaffRole(user.role)) {
        return errorResponse(
          403,
          'Only staff can link a knowledge article to a ticket',
          path,
        );
      }
      const ticket = findVisibleTicket(user, id);
      if (!ticket) {
        return errorResponse(404, 'Ticket not found', `/api/v1/tickets/${id}`);
      }
      const body = (await request.json()) as { articleId?: string };
      // Deliberately not the visibility clause: only staff reach this, and
      // linking a Draft is a legitimate "we are writing this up" action.
      const article = mockState.articles.find((a) => a.id === body.articleId);
      if (!article) {
        return badRequest(
          'articleId does not refer to an existing knowledge article',
          path,
        );
      }

      const existing = mockState.ticketArticles.find(
        (link) => link.ticketId === id && link.article.id === article.id,
      );
      if (existing) {
        // Idempotent: re-linking returns the existing link.
        return HttpResponse.json(existing, { status: 201 });
      }

      const link: TicketKnowledgeArticle = {
        ticketId: id,
        linkedAt: new Date().toISOString(),
        linkedBy: {
          id: user.id,
          firstName: 'Test',
          lastName: 'User',
          role: user.role,
        },
        article: articleSummary(article, user),
      };
      mockState.ticketArticles = [link, ...mockState.ticketArticles];
      return HttpResponse.json(link, { status: 201 });
    },
  ),

  http.delete(
    `${BASE}/tickets/:id/knowledge-articles/:articleId`,
    ({ request, params }) => {
      const user = requireUser(request);
      if (!user) {
        return errorResponse(401, 'Unauthorized', '/api/v1/tickets');
      }
      const id = String(params.id);
      if (!isStaffRole(user.role)) {
        return errorResponse(
          403,
          'Only staff can unlink a knowledge article from a ticket',
          `/api/v1/tickets/${id}/knowledge-articles`,
        );
      }
      const articleId = String(params.articleId);
      // Idempotent: unlinking something that is not linked still succeeds.
      mockState.ticketArticles = mockState.ticketArticles.filter(
        (link) => !(link.ticketId === id && link.article.id === articleId),
      );
      return new HttpResponse(null, { status: 204 });
    },
  ),
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

/* ---------------------------- analytics ---------------------------- */

const MAX_WINDOW_DAYS = 366;

/**
 * Reproduces the backend's window validation (`resolveWindow`) so a hand-made
 * request the UI would never send still gets the real 400. The UI must not
 * originate one; the mock keeps that honest.
 */
function analyticsWindowError(params: URLSearchParams): string | null {
  const from = params.get('from');
  const to = params.get('to');
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (start > end) return 'to must be the same as or later than from';
  if ((end - start) / 86_400_000 > MAX_WINDOW_DAYS) {
    return `The reporting window may span at most ${MAX_WINDOW_DAYS} days`;
  }
  return null;
}

function analyticsHandler(
  route: 'tickets' | 'sla' | 'categories' | 'agents',
  body: () => object,
) {
  const path = `/api/v1/analytics/${route}`;
  return http.get(`${BASE}/analytics/${route}`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return errorResponse(401, 'Unauthorized', path);
    const allowed =
      route === 'agents'
        ? isAnalyticsAgentRole(user.role)
        : isStaffRole(user.role);
    if (!allowed) {
      return errorResponse(
        403,
        'You are not allowed to view these analytics',
        path,
      );
    }
    const params = new URL(request.url).searchParams;
    mockState.analyticsRequests.push({ route, params });
    const windowError = analyticsWindowError(params);
    if (windowError) return badRequest(windowError, path);
    return HttpResponse.json(body());
  });
}

export const analyticsHandlers = [
  analyticsHandler('tickets', () => mockState.ticketAnalytics),
  analyticsHandler('sla', () => mockState.slaAnalytics),
  analyticsHandler('categories', () => mockState.categoryAnalytics),
  analyticsHandler('agents', () => mockState.agentAnalytics),
];

export const handlers = [
  ...coreHandlers,
  ...assetHandlers,
  ...knowledgeBaseHandlers,
  ...slaHandlers,
  ...analyticsHandlers,
];
