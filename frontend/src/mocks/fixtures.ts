import type {
  AuthenticatedUser,
  Role,
  Ticket,
  TicketCategory,
  TicketComment,
  TicketHistoryEntry,
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
