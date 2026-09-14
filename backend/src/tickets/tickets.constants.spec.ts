import { Role, TicketStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  isReopenTransition,
  isStaffRole,
} from './tickets.constants';

describe('isStaffRole', () => {
  it.each([
    [Role.SupportAgent, true],
    [Role.TeamLead, true],
    [Role.Administrator, true],
    [Role.Employee, false],
  ])('%s -> %s', (role, expected) => {
    expect(isStaffRole(role)).toBe(expected);
  });
});

describe('ALLOWED_TRANSITIONS', () => {
  it('makes Closed terminal: no outgoing transitions at all', () => {
    expect(ALLOWED_TRANSITIONS[TicketStatus.Closed]).toEqual([]);
  });

  it('allows Resolved -> Open (the only reopen path) and Resolved -> Closed', () => {
    expect(ALLOWED_TRANSITIONS[TicketStatus.Resolved]).toEqual(
      expect.arrayContaining([TicketStatus.Open, TicketStatus.Closed]),
    );
  });

  it('never allows a status to transition to itself', () => {
    for (const [status, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(targets).not.toContain(status);
    }
  });
});

describe('isReopenTransition', () => {
  it('is true only for Resolved -> Open', () => {
    expect(isReopenTransition(TicketStatus.Resolved, TicketStatus.Open)).toBe(
      true,
    );
  });

  it.each([
    [TicketStatus.Closed, TicketStatus.Open],
    [TicketStatus.Open, TicketStatus.Resolved],
    [TicketStatus.New, TicketStatus.Open],
  ])('is false for %s -> %s', (from, to) => {
    expect(isReopenTransition(from, to)).toBe(false);
  });
});
