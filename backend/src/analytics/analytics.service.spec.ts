import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_GROUPS } from './analytics.constants';
import { AnalyticsService } from './analytics.service';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function user(role: Role): AuthenticatedUser {
  return { id: 'u-1', email: 'u@opsnow.local', role };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    ticket: { count: jest.Mock; groupBy: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      ticket: { count: jest.fn(), groupBy: jest.fn() },
      $queryRaw: jest.fn(),
    };
    service = new AnalyticsService(prisma as unknown as PrismaService);
  });

  describe('role gates (defence in depth)', () => {
    it.each(['getTicketAnalytics', 'getSlaAnalytics', 'getCategoryAnalytics'] as const)(
      '%s rejects an Employee before touching the database',
      async (method) => {
        await expect(service[method](user(Role.Employee), {}, NOW)).rejects.toThrow(
          ForbiddenException,
        );
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.ticket.count).not.toHaveBeenCalled();
      },
    );

    it.each([Role.Employee, Role.SupportAgent])(
      'getAgentAnalytics rejects %s',
      async (role) => {
        await expect(service.getAgentAnalytics(user(role), {}, NOW)).rejects.toThrow(
          ForbiddenException,
        );
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
      },
    );
  });

  it('rejects an over-wide window before querying', async () => {
    await expect(
      service.getSlaAnalytics(
        user(Role.TeamLead),
        { from: new Date('2020-01-01T00:00:00Z'), to: NOW },
        NOW,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  describe('getTicketAnalytics', () => {
    it('zero-fills every status and priority and converts a BigInt count', async () => {
      prisma.ticket.count.mockResolvedValueOnce(9).mockResolvedValueOnce(4);
      prisma.ticket.groupBy
        .mockResolvedValueOnce([{ status: 'Open', _count: { _all: 3 } }])
        .mockResolvedValueOnce([{ priority: 'High', _count: { _all: 3 } }]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { resolved_count: BigInt(2), mean_minutes: 10.04, median_minutes: 9 },
      ]);

      const result = await service.getTicketAnalytics(user(Role.SupportAgent), {}, NOW);

      expect(result).toMatchObject({
        total: 9,
        backlog: 4,
        opened: 3,
        resolved: 2,
        resolution: { resolvedCount: 2, meanMinutes: 10, medianMinutes: 9 },
      });
      expect(result.byStatus).toEqual({
        New: 0,
        Open: 3,
        InProgress: 0,
        OnHold: 0,
        Resolved: 0,
        Closed: 0,
      });
      expect(result.byPriority).toEqual({ Low: 0, Medium: 0, High: 3, Critical: 0 });
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('reports null, not 0, for durations when nothing resolved', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.groupBy.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { resolved_count: 0, mean_minutes: null, median_minutes: null },
      ]);

      const result = await service.getTicketAnalytics(user(Role.TeamLead), {}, NOW);
      expect(result.resolution).toEqual({
        resolvedCount: 0,
        meanMinutes: null,
        medianMinutes: null,
      });
    });

    it('scopes every Prisma query by visibility AND the window/filters', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      prisma.ticket.groupBy.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { resolved_count: 0, mean_minutes: null, median_minutes: null },
      ]);

      await service.getTicketAnalytics(
        user(Role.SupportAgent),
        { categoryId: '11111111-1111-4111-8111-111111111111' },
        NOW,
      );

      const groupByWhere = prisma.ticket.groupBy.mock.calls[0][0].where;
      expect(groupByWhere.AND[0]).toEqual({
        AND: [
          { deletedAt: null },
          { categoryId: '11111111-1111-4111-8111-111111111111' },
        ],
      });
      expect(groupByWhere.AND[1].createdAt.lte).toEqual(NOW);
    });
  });

  describe('getSlaAnalytics', () => {
    it('derives compliance from met/breached and leaves it null for an empty window', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          tickets_with_sla: BigInt(5),
          response_met: 3,
          response_breached: 1,
          response_in_flight: 1,
          response_at_risk: 2,
          resolution_met: 0,
          resolution_breached: 0,
          resolution_in_flight: 0,
          resolution_at_risk: 1,
        },
      ]);

      const result = await service.getSlaAnalytics(user(Role.SupportAgent), {}, NOW);

      expect(result.ticketsWithSla).toBe(5);
      expect(result.response).toEqual({
        met: 3,
        breached: 1,
        complianceRate: 0.75,
        inFlightBreached: 1,
        atRisk: 2,
      });
      expect(result.resolution.complianceRate).toBeNull();
      expect(result.resolution.atRisk).toBe(1);
    });

    it('scopes met/breached to the window but NOT the at-risk and in-flight counts', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          tickets_with_sla: 0, response_met: 0, response_breached: 0, response_in_flight: 0,
          response_at_risk: 0, resolution_met: 0, resolution_breached: 0,
          resolution_in_flight: 0, resolution_at_risk: 0,
        },
      ]);
      await service.getSlaAnalytics(user(Role.SupportAgent), {}, NOW);

      const { sql } = prisma.$queryRaw.mock.calls[0][0] as { sql: string };
      const selectList = sql.slice(0, sql.indexOf('FROM tickets'));
      const columns = selectList.split(/\n\s*\(?count\(\*\)/).filter((c) => c.includes('AS '));
      const column = (alias: string) =>
        columns.find((c) => c.includes(`AS ${alias}`)) as string;

      for (const alias of [
        'tickets_with_sla', 'response_met', 'response_breached',
        'resolution_met', 'resolution_breached',
      ]) {
        expect(column(alias)).toContain('created_at');
      }
      for (const alias of [
        'response_in_flight', 'response_at_risk', 'resolution_in_flight', 'resolution_at_risk',
      ]) {
        expect(column(alias)).not.toContain('created_at');
      }
      // The window is not a top-level filter any more: only visibility/filters are.
      expect(sql.slice(sql.lastIndexOf('WHERE'))).not.toContain('created_at');
    });
  });

  describe('grouped endpoints', () => {
    function categoryRows(n: number) {
      return Array.from({ length: n }, (_, i) => ({
        category_id: `c-${i}`,
        category_name: `Cat ${i}`,
        volume: BigInt(n - i),
        resolved: 0,
        avg_resolution_minutes: null,
        sla_breaches: 0,
      }));
    }

    it('does not flag truncation at exactly the cap', async () => {
      prisma.$queryRaw.mockResolvedValueOnce(categoryRows(MAX_GROUPS));
      const result = await service.getCategoryAnalytics(user(Role.SupportAgent), {}, NOW);
      expect(result.categories).toHaveLength(MAX_GROUPS);
      expect(result.truncated).toBe(false);
    });

    it('drops the probe row and flags truncation beyond the cap', async () => {
      prisma.$queryRaw.mockResolvedValueOnce(categoryRows(MAX_GROUPS + 1));
      const result = await service.getCategoryAnalytics(user(Role.SupportAgent), {}, NOW);
      expect(result.categories).toHaveLength(MAX_GROUPS);
      expect(result.truncated).toBe(true);
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('keeps the uncategorised group as nulls', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { category_id: null, category_name: null, volume: 2, resolved: 1, avg_resolution_minutes: 30.26, sla_breaches: 1 },
      ]);
      const result = await service.getCategoryAnalytics(user(Role.SupportAgent), {}, NOW);
      expect(result.categories[0]).toEqual({
        categoryId: null,
        categoryName: null,
        volume: 2,
        resolved: 1,
        avgResolutionMinutes: 30.3,
        slaBreaches: 1,
      });
    });

    it('maps agent rows and derives compliance, null when nothing resolved', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { agent_id: 'a-1', agent_name: 'Ada Lovelace', assigned: BigInt(4), resolved: 2, avg_resolution_minutes: 60, resolution_met: 1, resolution_breached: 1 },
        { agent_id: 'a-2', agent_name: 'Alan Turing', assigned: 1, resolved: 0, avg_resolution_minutes: null, resolution_met: 0, resolution_breached: 0 },
      ]);
      const result = await service.getAgentAnalytics(user(Role.TeamLead), {}, NOW);
      expect(result.truncated).toBe(false);
      expect(result.agents[0]).toMatchObject({ agentId: 'a-1', assigned: 4, slaComplianceRate: 0.5 });
      expect(result.agents[1]).toMatchObject({ avgResolutionMinutes: null, slaComplianceRate: null });
    });
  });
});
