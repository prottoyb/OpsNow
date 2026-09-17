import type {
  Asset,
  AssetAssignment,
  AssetType,
  AuthenticatedUser,
  Role,
  SlaMetrics,
  SlaPolicy,
  Ticket,
  TicketAsset,
  TicketCategory,
  TicketComment,
  TicketHistoryEntry,
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

export function summaryOf(user: AuthenticatedUser): UserSummary {
  const names: Record<string, [string, string]> = {
    [IDS.employee]: ['Grace', 'Kim'],
    [IDS.agent]: ['Priya', 'Shah'],
    [IDS.otherAgent]: ['Marco', 'Rossi'],
  };
  const [firstName, lastName] = names[user.id] ?? ['Test', 'User'];
  return { id: user.id, firstName, lastName, role: user.role as Role };
}

export const employeeSummary = summaryOf(employeeUser);
export const agentSummary = summaryOf(agentUser);

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
