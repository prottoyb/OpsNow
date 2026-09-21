import { Role } from '@prisma/client';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import {
  ANALYTICS_AGENT_ROLES,
  complianceRate,
  DEFAULT_WINDOW_DAYS,
  isAnalyticsAgentRole,
  MAX_GROUPS,
  MAX_WINDOW_DAYS,
  roundMinutes,
} from './analytics.constants';

describe('analytics.constants', () => {
  describe('complianceRate', () => {
    it('returns null, not 0, when nothing completed', () => {
      expect(complianceRate(0, 0)).toBeNull();
    });

    it('returns 0 (a real rate) when everything breached', () => {
      expect(complianceRate(0, 4)).toBe(0);
    });

    it('returns 1 when everything was met', () => {
      expect(complianceRate(7, 0)).toBe(1);
    });

    it('rounds to four decimal places', () => {
      expect(complianceRate(2, 1)).toBe(0.6667);
    });
  });

  describe('roundMinutes', () => {
    it('preserves null', () => {
      expect(roundMinutes(null)).toBeNull();
    });

    it('rounds to one decimal place', () => {
      expect(roundMinutes(12.3456)).toBe(12.3);
      expect(roundMinutes(0)).toBe(0);
    });
  });

  describe('agent role gate', () => {
    it('admits only TeamLead and Administrator', () => {
      expect(isAnalyticsAgentRole(Role.TeamLead)).toBe(true);
      expect(isAnalyticsAgentRole(Role.Administrator)).toBe(true);
      expect(isAnalyticsAgentRole(Role.SupportAgent)).toBe(false);
      expect(isAnalyticsAgentRole(Role.Employee)).toBe(false);
    });

    it('is a strict subset of the staff roles', () => {
      for (const role of ANALYTICS_AGENT_ROLES) {
        expect(STAFF_ROLES).toContain(role);
      }
      expect(ANALYTICS_AGENT_ROLES.length).toBeLessThan(STAFF_ROLES.length);
    });
  });

  it('keeps every bound positive and the default inside the maximum', () => {
    expect(DEFAULT_WINDOW_DAYS).toBeGreaterThan(0);
    expect(DEFAULT_WINDOW_DAYS).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
    expect(MAX_GROUPS).toBeGreaterThan(0);
  });
});
