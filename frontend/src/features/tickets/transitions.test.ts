import { describe, expect, it } from 'vitest';
import { TICKET_STATUSES } from '../../types/api';
import { ALLOWED_TRANSITIONS, availableTransitions } from './transitions';

/**
 * These assertions mirror `ALLOWED_TRANSITIONS` in
 * `backend/src/tickets/tickets.constants.ts` field for field. They are
 * deliberately literal rather than derived: the point is that a change to
 * the backend matrix which is not reflected here fails loudly instead of
 * letting the UI offer a transition the server will reject.
 */
describe('ALLOWED_TRANSITIONS mirrors the backend matrix exactly', () => {
  it('covers every status and nothing else', () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual(
      [...TICKET_STATUSES].sort(),
    );
  });

  it('New', () => {
    expect(ALLOWED_TRANSITIONS.New).toEqual([
      'Open',
      'InProgress',
      'OnHold',
      'Resolved',
      'Closed',
    ]);
  });

  it('Open', () => {
    expect(ALLOWED_TRANSITIONS.Open).toEqual([
      'InProgress',
      'OnHold',
      'Resolved',
      'Closed',
    ]);
  });

  it('InProgress', () => {
    expect(ALLOWED_TRANSITIONS.InProgress).toEqual([
      'Open',
      'OnHold',
      'Resolved',
      'Closed',
    ]);
  });

  it('OnHold', () => {
    expect(ALLOWED_TRANSITIONS.OnHold).toEqual([
      'Open',
      'InProgress',
      'Resolved',
      'Closed',
    ]);
  });

  it('Resolved', () => {
    expect(ALLOWED_TRANSITIONS.Resolved).toEqual(['Closed', 'Open']);
  });

  it('Closed is terminal', () => {
    expect(ALLOWED_TRANSITIONS.Closed).toEqual([]);
  });

  it('no status lists itself as a target', () => {
    for (const status of TICKET_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status]).not.toContain(status);
    }
  });
});

describe('availableTransitions', () => {
  it('gives staff the full matrix for each status', () => {
    for (const status of TICKET_STATUSES) {
      expect(availableTransitions(status, 'SupportAgent')).toEqual(
        ALLOWED_TRANSITIONS[status],
      );
      expect(availableTransitions(status, 'TeamLead')).toEqual(
        ALLOWED_TRANSITIONS[status],
      );
      expect(availableTransitions(status, 'Administrator')).toEqual(
        ALLOWED_TRANSITIONS[status],
      );
    }
  });

  it('gives an Employee only the reopen path', () => {
    expect(availableTransitions('Resolved', 'Employee')).toEqual(['Open']);
    expect(availableTransitions('New', 'Employee')).toEqual([]);
    expect(availableTransitions('Open', 'Employee')).toEqual([]);
    expect(availableTransitions('InProgress', 'Employee')).toEqual([]);
    expect(availableTransitions('OnHold', 'Employee')).toEqual([]);
  });

  it('never lets anyone leave Closed, Administrator included', () => {
    expect(availableTransitions('Closed', 'Administrator')).toEqual([]);
    expect(availableTransitions('Closed', 'TeamLead')).toEqual([]);
    expect(availableTransitions('Closed', 'SupportAgent')).toEqual([]);
    expect(availableTransitions('Closed', 'Employee')).toEqual([]);
  });
});
