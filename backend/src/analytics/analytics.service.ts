import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { isStaffRole } from '../tickets/tickets.constants';
import {
  resolutionAtRiskSql,
  resolutionInFlightBreachedSql,
  responseAtRiskSql,
  responseInFlightBreachedSql,
  liveClockSql,
} from './analytics.at-risk';
import {
  complianceRate,
  isAnalyticsAgentRole,
  MAX_GROUPS,
  roundMinutes,
} from './analytics.constants';
import {
  AnalyticsWindow,
  analyticsTicketSql,
  analyticsTicketWhere,
  resolveWindow,
} from './analytics.filters';
import { AgentAnalyticsResponseDto } from './dto/agent-analytics-response.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsWindowDto } from './dto/analytics-window.dto';
import { CategoryAnalyticsResponseDto } from './dto/category-analytics-response.dto';
import { SlaAnalyticsResponseDto } from './dto/sla-analytics-response.dto';
import { TicketAnalyticsResponseDto } from './dto/ticket-analytics-response.dto';

/** Statuses that make up the open backlog. */
const BACKLOG_STATUSES: readonly TicketStatus[] = [
  TicketStatus.New,
  TicketStatus.Open,
  TicketStatus.InProgress,
  TicketStatus.OnHold,
];

/**
 * A raw aggregate value. Counts are cast to `int` in SQL so the driver hands
 * back a `number`, but `count(*)` is `bigint` by default and a `BigInt` that
 * reached `JSON.stringify` would throw — so every value passes through
 * `toNumber` regardless, and the conversion is a deliberate step rather than
 * something that happens to work.
 */
type RawNumber = number | bigint;

function toNumber(value: RawNumber): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function toNullableNumber(value: RawNumber | null): number | null {
  return value === null ? null : toNumber(value);
}

interface ResolutionRow {
  resolved_count: RawNumber;
  mean_minutes: number | null;
  median_minutes: number | null;
}

interface SlaRow {
  tickets_with_sla: RawNumber;
  response_met: RawNumber;
  response_breached: RawNumber;
  response_in_flight: RawNumber;
  response_at_risk: RawNumber;
  resolution_met: RawNumber;
  resolution_breached: RawNumber;
  resolution_in_flight: RawNumber;
  resolution_at_risk: RawNumber;
}

interface CategoryRow {
  category_id: string | null;
  category_name: string | null;
  volume: RawNumber;
  resolved: RawNumber;
  avg_resolution_minutes: number | null;
  sla_breaches: RawNumber;
}

interface AgentRow {
  agent_id: string;
  agent_name: string;
  assigned: RawNumber;
  resolved: RawNumber;
  avg_resolution_minutes: number | null;
  resolution_met: RawNumber;
  resolution_breached: RawNumber;
}

/** Minutes from creation to resolution, for a row whose `resolved_at` is set. */
const DURATION_MINUTES_SQL = Prisma.sql`extract(epoch from (t.resolved_at - t.created_at)) / 60`;

/**
 * Phase 10 analytics. Every figure is aggregated in the database on demand —
 * no cache, no summary table (ADR-017) — and scoped by the caller's own ticket
 * visibility ANDed with the request filters (`analytics.filters.ts`).
 *
 * Every route is double-gated: the controller's `@Roles` guard plus an
 * assertion here, so the rule survives a controller being re-mounted.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTicketAnalytics(
    user: AuthenticatedUser,
    query: AnalyticsQueryDto,
    now: Date = new Date(),
  ): Promise<TicketAnalyticsResponseDto> {
    this.assertStaff(user);
    const window = resolveWindow(query, now);
    const where = analyticsTicketWhere(user, query);
    const opened: Prisma.TicketWhereInput = {
      AND: [where, { createdAt: { gte: window.from, lte: window.to } }],
    };

    const [total, backlog, statusGroups, priorityGroups, resolutionRows] =
      await Promise.all([
        this.prisma.ticket.count({ where }),
        this.prisma.ticket.count({
          where: { AND: [where, { status: { in: [...BACKLOG_STATUSES] } }] },
        }),
        this.prisma.ticket.groupBy({
          by: ['status'],
          where: opened,
          _count: { _all: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: opened,
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<ResolutionRow[]>(Prisma.sql`
          SELECT
            count(*)::int AS resolved_count,
            (avg(${DURATION_MINUTES_SQL}))::float8 AS mean_minutes,
            (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${DURATION_MINUTES_SQL}))::float8 AS median_minutes
          FROM tickets t
          WHERE ${analyticsTicketSql(user, query)}
            AND t.resolved_at >= ${window.from}::timestamptz
            AND t.resolved_at <= ${window.to}::timestamptz
        `),
      ]);

    const byStatus = Object.fromEntries(
      Object.values(TicketStatus).map((s) => [s, 0]),
    ) as Record<TicketStatus, number>;
    for (const group of statusGroups) {
      byStatus[group.status] = group._count._all;
    }
    const byPriority = Object.fromEntries(
      Object.values(TicketPriority).map((p) => [p, 0]),
    ) as Record<TicketPriority, number>;
    for (const group of priorityGroups) {
      byPriority[group.priority] = group._count._all;
    }

    // An aggregate without GROUP BY always yields exactly one row.
    const resolution = resolutionRows[0];
    const resolvedCount = toNumber(resolution.resolved_count);

    return {
      window: toWindowDto(window),
      total,
      opened: Object.values(byStatus).reduce((a, b) => a + b, 0),
      resolved: resolvedCount,
      backlog,
      byStatus,
      byPriority,
      resolution: {
        resolvedCount,
        meanMinutes: roundMinutes(toNullableNumber(resolution.mean_minutes)),
        medianMinutes: roundMinutes(toNullableNumber(resolution.median_minutes)),
      },
    };
  }

  async getSlaAnalytics(
    user: AuthenticatedUser,
    query: AnalyticsQueryDto,
    now: Date = new Date(),
  ): Promise<SlaAnalyticsResponseDto> {
    this.assertStaff(user);
    const window = resolveWindow(query, now);

    const rows = await this.prisma.$queryRaw<SlaRow[]>(Prisma.sql`
      SELECT
        count(*)::int AS tickets_with_sla,
        (count(*) FILTER (WHERE s.response_at IS NOT NULL AND NOT s.response_breached))::int AS response_met,
        (count(*) FILTER (WHERE s.response_at IS NOT NULL AND s.response_breached))::int AS response_breached,
        (count(*) FILTER (WHERE ${liveClockSql} AND ${responseInFlightBreachedSql(now)}))::int AS response_in_flight,
        (count(*) FILTER (WHERE ${liveClockSql} AND ${responseAtRiskSql(now)}))::int AS response_at_risk,
        (count(*) FILTER (WHERE t.resolved_at IS NOT NULL AND NOT s.resolution_breached))::int AS resolution_met,
        (count(*) FILTER (WHERE t.resolved_at IS NOT NULL AND s.resolution_breached))::int AS resolution_breached,
        (count(*) FILTER (WHERE ${liveClockSql} AND ${resolutionInFlightBreachedSql(now)}))::int AS resolution_in_flight,
        (count(*) FILTER (WHERE ${liveClockSql} AND ${resolutionAtRiskSql(now)}))::int AS resolution_at_risk
      FROM tickets t
      JOIN ticket_sla s ON s.ticket_id = t.id
      WHERE ${analyticsTicketSql(user, query)}
        AND ${createdInWindowSql(window)}
    `);

    const row = rows[0];
    const responseMet = toNumber(row.response_met);
    const responseBreached = toNumber(row.response_breached);
    const resolutionMet = toNumber(row.resolution_met);
    const resolutionBreached = toNumber(row.resolution_breached);

    return {
      window: toWindowDto(window),
      ticketsWithSla: toNumber(row.tickets_with_sla),
      response: {
        met: responseMet,
        breached: responseBreached,
        complianceRate: complianceRate(responseMet, responseBreached),
        inFlightBreached: toNumber(row.response_in_flight),
        atRisk: toNumber(row.response_at_risk),
      },
      resolution: {
        met: resolutionMet,
        breached: resolutionBreached,
        complianceRate: complianceRate(resolutionMet, resolutionBreached),
        inFlightBreached: toNumber(row.resolution_in_flight),
        atRisk: toNumber(row.resolution_at_risk),
      },
    };
  }

  async getCategoryAnalytics(
    user: AuthenticatedUser,
    query: AnalyticsQueryDto,
    now: Date = new Date(),
  ): Promise<CategoryAnalyticsResponseDto> {
    this.assertStaff(user);
    const window = resolveWindow(query, now);

    // LIMIT cap + 1: the extra row is only there to learn whether the cap bit.
    const rows = await this.prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
      SELECT
        t.category_id AS category_id,
        c.name AS category_name,
        count(*)::int AS volume,
        (count(*) FILTER (WHERE t.resolved_at IS NOT NULL))::int AS resolved,
        (avg(${DURATION_MINUTES_SQL}) FILTER (WHERE t.resolved_at IS NOT NULL))::float8 AS avg_resolution_minutes,
        (count(*) FILTER (WHERE s.id IS NOT NULL AND (
          ${responseBreachedAnySql(now)} OR ${resolutionBreachedAnySql(now)}
        )))::int AS sla_breaches
      FROM tickets t
      LEFT JOIN ticket_categories c ON c.id = t.category_id
      LEFT JOIN ticket_sla s ON s.ticket_id = t.id
      WHERE ${analyticsTicketSql(user, query)}
        AND ${createdInWindowSql(window)}
      GROUP BY t.category_id, c.name
      ORDER BY volume DESC, c.name ASC NULLS LAST, t.category_id ASC NULLS LAST
      LIMIT ${MAX_GROUPS + 1}
    `);

    return {
      window: toWindowDto(window),
      categories: rows.slice(0, MAX_GROUPS).map((r) => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        volume: toNumber(r.volume),
        resolved: toNumber(r.resolved),
        avgResolutionMinutes: roundMinutes(
          toNullableNumber(r.avg_resolution_minutes),
        ),
        slaBreaches: toNumber(r.sla_breaches),
      })),
      truncated: rows.length > MAX_GROUPS,
    };
  }

  async getAgentAnalytics(
    user: AuthenticatedUser,
    query: AnalyticsQueryDto,
    now: Date = new Date(),
  ): Promise<AgentAnalyticsResponseDto> {
    if (!isAnalyticsAgentRole(user.role)) {
      throw new ForbiddenException(
        'Only team leads and administrators can access agent analytics',
      );
    }
    const window = resolveWindow(query, now);

    const rows = await this.prisma.$queryRaw<AgentRow[]>(Prisma.sql`
      SELECT
        t.assignee_id AS agent_id,
        (u.first_name || ' ' || u.last_name) AS agent_name,
        count(*)::int AS assigned,
        (count(*) FILTER (WHERE t.resolved_at IS NOT NULL))::int AS resolved,
        (avg(${DURATION_MINUTES_SQL}) FILTER (WHERE t.resolved_at IS NOT NULL))::float8 AS avg_resolution_minutes,
        (count(*) FILTER (WHERE t.resolved_at IS NOT NULL AND s.id IS NOT NULL AND NOT s.resolution_breached))::int AS resolution_met,
        (count(*) FILTER (WHERE t.resolved_at IS NOT NULL AND s.id IS NOT NULL AND s.resolution_breached))::int AS resolution_breached
      FROM tickets t
      JOIN users u ON u.id = t.assignee_id
      LEFT JOIN ticket_sla s ON s.ticket_id = t.id
      WHERE ${analyticsTicketSql(user, query)}
        AND ${createdInWindowSql(window)}
      GROUP BY t.assignee_id, u.first_name, u.last_name
      ORDER BY assigned DESC, agent_name ASC, t.assignee_id ASC
      LIMIT ${MAX_GROUPS + 1}
    `);

    return {
      window: toWindowDto(window),
      agents: rows.slice(0, MAX_GROUPS).map((r) => {
        const met = toNumber(r.resolution_met);
        const breached = toNumber(r.resolution_breached);
        return {
          agentId: r.agent_id,
          agentName: r.agent_name,
          assigned: toNumber(r.assigned),
          resolved: toNumber(r.resolved),
          avgResolutionMinutes: roundMinutes(
            toNullableNumber(r.avg_resolution_minutes),
          ),
          resolutionMet: met,
          resolutionBreached: breached,
          slaComplianceRate: complianceRate(met, breached),
        };
      }),
      truncated: rows.length > MAX_GROUPS,
    };
  }

  private assertStaff(user: AuthenticatedUser): void {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException('Only staff can access analytics');
    }
  }
}

function toWindowDto(window: AnalyticsWindow): AnalyticsWindowDto {
  return { from: window.from.toISOString(), to: window.to.toISOString() };
}

/** Assumes `tickets` aliased `t`. Both ends inclusive. */
function createdInWindowSql(window: AnalyticsWindow): Prisma.Sql {
  return Prisma.sql`t.created_at >= ${window.from}::timestamptz AND t.created_at <= ${window.to}::timestamptz`;
}

/** Any breached response clock: completed-and-breached, or live and past due. */
function responseBreachedAnySql(now: Date): Prisma.Sql {
  return Prisma.sql`((s.response_at IS NOT NULL AND s.response_breached) OR (${liveClockSql} AND ${responseInFlightBreachedSql(now)}))`;
}

/** Any breached resolution clock: completed-and-breached, or live and past due. */
function resolutionBreachedAnySql(now: Date): Prisma.Sql {
  return Prisma.sql`((t.resolved_at IS NOT NULL AND s.resolution_breached) OR (${liveClockSql} AND ${resolutionInFlightBreachedSql(now)}))`;
}
