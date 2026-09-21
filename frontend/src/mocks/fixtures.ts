import type {
  AgentAnalytics,
  AiDraftResponse,
  AiResolutionSummary,
  AiStatus,
  AiTriage,
  ArticleFeedbackEntry,
  Asset,
  AssetAssignment,
  AssetType,
  AuditLogEntry,
  AuthenticatedUser,
  CategoryAnalytics,
  KnowledgeArticle,
  KnowledgeArticleSummary,
  KnowledgeBaseCategory,
  Role,
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
  TicketSla,
  UserSummary,
} from '../types/api';

/** Fixed UUIDs so tests can reference records without threading ids around. */
export const IDS = {
  employee: '11111111-1111-4111-8111-111111111111',
  agent: '22222222-2222-4222-8222-222222222222',
  otherAgent: '33333333-3333-4333-8333-333333333333',
  ticketA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ticketB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  categoryHardware: 'c1111111-1111-4111-8111-111111111111',
  categoryLaptop: 'c2222222-2222-4222-8222-222222222222',
  categorySoftware: 'c3333333-3333-4333-8333-333333333333',
  categoryNetwork: 'c4444444-4444-4444-8444-444444444444',
  policyCritical: 'b1111111-1111-4111-8111-111111111111',
  policyHigh: 'b2222222-2222-4222-8222-222222222222',
  policyMedium: 'b3333333-3333-4333-8333-333333333333',
  assetTypeLaptop: '91111111-1111-4111-8111-111111111111',
  assetTypeMonitor: '92222222-2222-4222-8222-222222222222',
  assetA: '71111111-1111-4111-8111-111111111111',
  assetB: '72222222-2222-4222-8222-222222222222',
  assignmentA: '81111111-1111-4111-8111-111111111111',
  teamLead: '44444444-4444-4444-8444-444444444444',
  admin: '55555555-5555-4555-8555-555555555555',
  kbCategoryAccounts: 'd1111111-1111-4111-8111-111111111111',
  kbCategoryPasswords: 'd2222222-2222-4222-8222-222222222222',
  kbCategoryNetwork: 'd3333333-3333-4333-8333-333333333333',
  articleA: '61111111-1111-4111-8111-111111111111',
  articleB: '62222222-2222-4222-8222-222222222222',
  feedbackA: '51111111-1111-4111-8111-111111111111',
} as const;

export const employeeUser: AuthenticatedUser = {
  id: IDS.employee,
  email: 'employee1@opsnow.local',
  role: 'Employee',
};

export const agentUser: AuthenticatedUser = {
  id: IDS.agent,
  email: 'agent1@opsnow.local',
  role: 'SupportAgent',
};

/**
 * A second SupportAgent, used to exercise the knowledge base's authorship
 * rule: an agent may edit their own articles but not a colleague's.
 */
export const otherAgentUser: AuthenticatedUser = {
  id: IDS.otherAgent,
  email: 'agent2@opsnow.local',
  role: 'SupportAgent',
};

/**
 * Publishing is restricted to TeamLead/Administrator, so the knowledge base
 * is the first feature that needs a non-agent staff identity in tests.
 */
export const teamLeadUser: AuthenticatedUser = {
  id: IDS.teamLead,
  email: 'lead1@opsnow.local',
  role: 'TeamLead',
};

/** The audit log is Administrator-only, so it needs its own identity. */
export const adminUser: AuthenticatedUser = {
  id: IDS.admin,
  email: 'admin1@opsnow.local',
  role: 'Administrator',
};

export function summaryOf(user: AuthenticatedUser): UserSummary {
  const names: Record<string, [string, string]> = {
    [IDS.employee]: ['Grace', 'Kim'],
    [IDS.agent]: ['Priya', 'Shah'],
    [IDS.otherAgent]: ['Marco', 'Rossi'],
    [IDS.teamLead]: ['Dana', 'Okafor'],
    [IDS.admin]: ['Ada', 'Admin'],
  };
  const [firstName, lastName] = names[user.id] ?? ['Test', 'User'];
  return { id: user.id, firstName, lastName, role: user.role as Role };
}

export const employeeSummary = summaryOf(employeeUser);
export const agentSummary = summaryOf(agentUser);
export const otherAgentSummary = summaryOf(otherAgentUser);
export const teamLeadSummary = summaryOf(teamLeadUser);

/**
 * Deliberately flat and alphabetical, exactly as `GET /ticket-categories`
 * returns it — the UI is responsible for assembling the optgroup tree.
 */
export const categories: TicketCategory[] = [
  {
    id: IDS.categoryHardware,
    name: 'Hardware',
    parentId: null,
    isActive: true,
  },
  {
    id: IDS.categoryLaptop,
    name: 'Laptop',
    parentId: IDS.categoryHardware,
    isActive: true,
  },
  { id: IDS.categoryNetwork, name: 'Network', parentId: null, isActive: true },
  { id: IDS.categorySoftware, name: 'Software', parentId: null, isActive: true },
];

/** Minutes from "now" expressed as the ISO string the wire would carry. */
function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * A healthy, running SLA by default — both clocks live, nothing paused,
 * nothing breached. Every other case is produced by overriding, so each test
 * states exactly the SLA situation it is about.
 *
 * The due dates are relative to "now" so the default fixture is internally
 * consistent with its own `minutesRemaining`. Tests that deliberately want
 * an inconsistent pair (a `Breached` state with a FUTURE due date, say, to
 * prove the UI never re-derives state from a date) override them explicitly.
 */
export function makeTicketSla(overrides: Partial<TicketSla> = {}): TicketSla {
  return {
    responseTargetMinutes: 60,
    resolutionTargetMinutes: 480,
    responseDueAt: minutesFromNow(45),
    responseAt: null,
    responseState: 'Running',
    responseMinutesRemaining: 45,
    resolutionDueAt: minutesFromNow(300),
    resolutionState: 'Running',
    resolutionMinutesRemaining: 300,
    isPaused: false,
    totalPausedMinutes: 0,
    ...overrides,
  };
}

export const slaPolicies: SlaPolicy[] = [
  {
    id: IDS.policyCritical,
    name: 'Critical priority',
    priority: 'Critical',
    responseTimeMinutes: 15,
    resolutionTimeMinutes: 240,
    isActive: true,
  },
  {
    id: IDS.policyHigh,
    name: 'High priority',
    priority: 'High',
    responseTimeMinutes: 60,
    resolutionTimeMinutes: 480,
    isActive: true,
  },
  {
    id: IDS.policyMedium,
    name: 'Retired medium priority',
    priority: 'Medium',
    responseTimeMinutes: 240,
    resolutionTimeMinutes: 1440,
    isActive: false,
  },
];

export const slaMetrics: SlaMetrics = {
  openWithSla: 12,
  resolutionBreachedInFlight: 3,
  resolutionBreachedCompleted: 5,
  respondedOnTime: 21,
  respondedLate: 4,
  responseOverdueOutstanding: 2,
  neverResponded: 1,
};

/* ------------------------------ analytics ------------------------------ */

const ANALYTICS_WINDOW = {
  from: '2026-08-22T00:00:00.000Z',
  to: '2026-09-21T12:00:00.000Z',
};

export const ticketAnalytics: TicketAnalytics = {
  window: ANALYTICS_WINDOW,
  total: 140,
  opened: 48,
  resolved: 41,
  backlog: 17,
  byStatus: {
    New: 4,
    Open: 9,
    InProgress: 6,
    OnHold: 2,
    Resolved: 20,
    Closed: 7,
  },
  byPriority: { Low: 10, Medium: 20, High: 12, Critical: 6 },
  resolution: { resolvedCount: 41, meanMinutes: 185.5, medianMinutes: 120 },
};

export const slaAnalytics: SlaAnalytics = {
  window: ANALYTICS_WINDOW,
  ticketsWithSla: 46,
  response: {
    met: 30,
    breached: 10,
    complianceRate: 0.75,
    inFlightBreached: 2,
    atRisk: 3,
  },
  resolution: {
    met: 25,
    breached: 5,
    complianceRate: 0.8333,
    inFlightBreached: 4,
    atRisk: 1,
  },
};

export const categoryAnalytics: CategoryAnalytics = {
  window: ANALYTICS_WINDOW,
  truncated: false,
  categories: [
    {
      categoryId: IDS.categoryNetwork,
      categoryName: 'Network',
      volume: 20,
      resolved: 15,
      avgResolutionMinutes: 95,
      slaBreaches: 2,
    },
    {
      categoryId: IDS.categorySoftware,
      categoryName: 'Software',
      volume: 10,
      resolved: 0,
      avgResolutionMinutes: null,
      slaBreaches: 0,
    },
    {
      categoryId: null,
      categoryName: null,
      volume: 4,
      resolved: 1,
      avgResolutionMinutes: 30,
      slaBreaches: 1,
    },
  ],
};

export const agentAnalytics: AgentAnalytics = {
  window: ANALYTICS_WINDOW,
  truncated: false,
  agents: [
    {
      agentId: IDS.agent,
      agentName: 'Priya Shah',
      assigned: 22,
      resolved: 18,
      avgResolutionMinutes: 140,
      resolutionMet: 15,
      resolutionBreached: 3,
      slaComplianceRate: 0.8333,
    },
    {
      agentId: IDS.otherAgent,
      agentName: 'Marco Rossi',
      assigned: 9,
      resolved: 0,
      avgResolutionMinutes: null,
      resolutionMet: 0,
      resolutionBreached: 0,
      slaComplianceRate: null,
    },
  ],
};

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: IDS.ticketA,
    ticketNumber: 1001,
    subject: 'Laptop will not boot',
    description: 'It shows a black screen after the login sound.',
    status: 'New',
    priority: 'Medium',
    reopenedCount: 0,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-05T09:00:00.000Z',
    requester: employeeSummary,
    assignee: null,
    category: categories[0],
    sla: makeTicketSla(),
    ...overrides,
  };
}

export function makeComment(
  overrides: Partial<TicketComment> = {},
): TicketComment {
  return {
    id: 'd1111111-1111-4111-8111-111111111111',
    body: 'Thanks for reporting this.',
    visibility: 'Public',
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    author: agentSummary,
    ...overrides,
  };
}

export function makeHistoryEntry(
  overrides: Partial<TicketHistoryEntry> = {},
): TicketHistoryEntry {
  return {
    id: 'e1111111-1111-4111-8111-111111111111',
    fieldName: 'status',
    oldValue: null,
    newValue: 'New',
    createdAt: '2026-01-05T09:00:00.000Z',
    actor: employeeSummary,
    ...overrides,
  };
}

/**
 * Deliberately flat, exactly as `GET /asset-types` returns it — active
 * types only.
 */
export const assetTypes: AssetType[] = [
  { id: IDS.assetTypeLaptop, name: 'Laptop', isActive: true },
  { id: IDS.assetTypeMonitor, name: 'Monitor', isActive: true },
];

export function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: IDS.assetA,
    assetTag: 'LAPTOP-0001',
    name: 'ThinkPad X1',
    status: 'InStock',
    serialNumber: 'SN-0001',
    purchaseDate: '2025-01-15T00:00:00.000Z',
    warrantyExpiresAt: '2028-01-15T00:00:00.000Z',
    notes: null,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    assetType: assetTypes[0],
    currentAssignee: null,
    ...overrides,
  };
}

export function makeAssignment(
  overrides: Partial<AssetAssignment> = {},
): AssetAssignment {
  return {
    id: IDS.assignmentA,
    assetId: IDS.assetA,
    assignedAt: '2026-01-02T09:00:00.000Z',
    returnedAt: null,
    notes: null,
    assignedTo: employeeSummary,
    assignedBy: agentSummary,
    ...overrides,
  };
}

/**
 * Deliberately flat, exactly as `GET /kb-categories` returns it — active
 * categories only, and the same shape as `TicketCategory`.
 */
export const kbCategories: KnowledgeBaseCategory[] = [
  {
    id: IDS.kbCategoryAccounts,
    name: 'Accounts',
    parentId: null,
    isActive: true,
  },
  {
    id: IDS.kbCategoryPasswords,
    name: 'Passwords',
    parentId: IDS.kbCategoryAccounts,
    isActive: true,
  },
  {
    id: IDS.kbCategoryNetwork,
    name: 'Network',
    parentId: null,
    isActive: true,
  },
];

/**
 * The FULL article, as `GET /kb-articles/:id` returns it. Published and
 * authored by the agent by default; every other case is produced by
 * overriding, so each test states exactly the situation it is about.
 *
 * `mockState.articles` holds these full records and the handlers derive the
 * summary projection from them — the same way the backend does — so a test
 * can never accidentally assert against a list row carrying `content`.
 *
 * `feedback` here is only a placeholder: the handlers DERIVE the two counts
 * and `myFeedback` from `mockState.articleFeedback`, so a test that wants
 * non-zero counts seeds feedback rows rather than overriding this field.
 */
export function makeArticle(
  overrides: Partial<KnowledgeArticle> = {},
): KnowledgeArticle {
  return {
    id: IDS.articleA,
    title: 'How to reset your password',
    slug: 'how-to-reset-your-password',
    content:
      'Open the self-service portal.\nChoose "Forgotten password".\nFollow the emailed link within 15 minutes.',
    status: 'Published',
    category: kbCategories[1],
    author: agentSummary,
    publishedAt: '2026-01-04T09:00:00.000Z',
    viewCount: 42,
    createdAt: '2026-01-03T09:00:00.000Z',
    updatedAt: '2026-01-04T09:00:00.000Z',
    feedback: { helpfulCount: 0, notHelpfulCount: 0, myFeedback: null },
    ...overrides,
  };
}

/** The summary projection of a full article — no `content`, plus `excerpt`
 * and the two aggregate counts. Mirrors what the backend list route emits. */
export function toArticleSummary(
  article: KnowledgeArticle,
): KnowledgeArticleSummary {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
    excerpt: excerptOf(article.content),
    category: article.category,
    author: article.author,
    publishedAt: article.publishedAt,
    viewCount: article.viewCount,
    updatedAt: article.updatedAt,
    helpfulCount: article.feedback.helpfulCount,
    notHelpfulCount: article.feedback.notHelpfulCount,
  };
}

/** Mirrors `backend/src/knowledge-base/knowledge-base.text.ts`: the body
 * flattened to one line and capped at 200 characters. */
const EXCERPT_LENGTH = 200;

function excerptOf(content: string): string {
  const flattened = content.replace(/\s+/g, ' ').trim();
  return flattened.length <= EXCERPT_LENGTH
    ? flattened
    : `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}...`;
}

/**
 * One stored vote. `articleId` is mock-only bookkeeping: the wire shape
 * (`ArticleFeedbackEntry`) carries no article id because every route that
 * returns one is already scoped to a single article.
 */
export type MockArticleFeedback = ArticleFeedbackEntry & { articleId: string };

export function makeArticleFeedback(
  overrides: Partial<MockArticleFeedback> = {},
): MockArticleFeedback {
  return {
    id: IDS.feedbackA,
    articleId: IDS.articleA,
    isHelpful: true,
    comment: 'Clearer than the old runbook.',
    createdAt: '2026-01-06T09:00:00.000Z',
    user: employeeSummary,
    ...overrides,
  };
}

export function makeTicketKnowledgeArticle(
  overrides: Partial<TicketKnowledgeArticle> = {},
): TicketKnowledgeArticle {
  return {
    ticketId: IDS.ticketA,
    linkedAt: '2026-01-05T09:30:00.000Z',
    linkedBy: agentSummary,
    article: toArticleSummary(makeArticle()),
    ...overrides,
  };
}

export function makeTicketAsset(
  overrides: Partial<TicketAsset> = {},
): TicketAsset {
  const asset = makeAsset();
  return {
    ticketId: IDS.ticketA,
    linkedAt: '2026-01-05T09:30:00.000Z',
    linkedBy: agentSummary,
    asset: {
      id: asset.id,
      assetTag: asset.assetTag,
      name: asset.name,
      status: asset.status,
      assetType: asset.assetType,
    },
    ...overrides,
  };
}

/* ---------------------------- AI assistant ---------------------------- */

/**
 * The assistant as a configured server reports it to staff. The default in the
 * real application is `{ enabled: false, mode: 'disabled' }` — it ships with
 * no provider — but tests overwhelmingly exercise the working path, so the
 * fixture is the enabled one and the off cases are stated explicitly by the
 * tests that are about them.
 */
export const aiStatusEnabled: AiStatus = { enabled: true, mode: 'anthropic' };
export const aiStatusDisabled: AiStatus = { enabled: false, mode: 'disabled' };

export function makeAiTriage(overrides: Partial<AiTriage> = {}): AiTriage {
  return {
    suggestedCategory: {
      id: IDS.categorySoftware,
      name: 'Software',
    },
    // Deliberately different from `makeTicket()`'s 'Medium', so the default
    // fixture exercises the Apply path rather than the "already set" one.
    suggestedPriority: 'High',
    rationale:
      'The description mentions a black screen after the login sound, which usually points at a failed display driver rather than hardware.',
    relatedArticles: [
      {
        id: IDS.articleA,
        title: 'How to reset your password',
        slug: 'how-to-reset-your-password',
      },
    ],
    mode: 'anthropic',
    ...overrides,
  };
}

export function makeAiDraft(
  overrides: Partial<AiDraftResponse> = {},
): AiDraftResponse {
  return {
    draft:
      'Hello,\n\nThanks for reporting this. Please try booting in safe mode and let us know whether the screen comes up.',
    referencedArticles: [],
    mode: 'anthropic',
    ...overrides,
  };
}

export function makeAiResolutionSummary(
  overrides: Partial<AiResolutionSummary> = {},
): AiResolutionSummary {
  return {
    summary:
      'Display driver rolled back to the previous version; the laptop now boots normally.',
    mode: 'anthropic',
    ...overrides,
  };
}

export function makeAuditLog(
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry {
  return {
    id: 'e0000000-0000-4000-8000-000000000001',
    action: 'ticket.created',
    outcome: 'success',
    entityType: 'Ticket',
    entityId: IDS.ticketA,
    metadata: { outcome: 'success', ticketNumber: 'TCK-1', priority: 'High' },
    ipAddress: null,
    userAgent: null,
    createdAt: '2026-03-02T10:15:00.000Z',
    actor: agentSummary,
    ...overrides,
  };
}
