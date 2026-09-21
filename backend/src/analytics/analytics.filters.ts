import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import {
  ticketVisibilitySql,
  ticketVisibilityWhere,
} from '../common/ticket-visibility';
import {
  DEFAULT_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  MINUTES_PER_DAY,
} from './analytics.constants';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/** The resolved reporting window. Both ends are inclusive. */
export interface AnalyticsWindow {
  from: Date;
  to: Date;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MINUTES_PER_DAY * 60_000);
}

/**
 * Applies the documented defaults and enforces the width cap.
 *
 * The cap lives here rather than on the DTO because it can only be checked
 * after the defaults are applied, and one of those defaults is the current
 * instant — a DTO validator has no clock. Ordering (`from <= to`) IS checked
 * on the DTO, because that one needs no clock, so a caller who transposes the
 * two ends still gets the field-level 400 that names the field.
 *
 * `now` is a parameter, never read from inside, so the whole function stays
 * pure and testable.
 */
export function resolveWindow(
  query: AnalyticsQueryDto,
  now: Date,
): AnalyticsWindow {
  const to = query.to ?? now;
  const from = query.from ?? addDays(to, -DEFAULT_WINDOW_DAYS);

  // Defence in depth: the DTO already rejects this, but `resolveWindow` is
  // also reachable from a unit test or a future caller that has not been
  // through the validation pipe, and an inverted window would silently make
  // every aggregate zero rather than fail.
  if (from.getTime() > to.getTime()) {
    throw new BadRequestException('to must be the same as or later than from');
  }

  const spanDays = (to.getTime() - from.getTime()) / (MINUTES_PER_DAY * 60_000);
  if (spanDays > MAX_WINDOW_DAYS) {
    throw new BadRequestException(
      `The reporting window may span at most ${MAX_WINDOW_DAYS} days`,
    );
  }

  return { from, to };
}

/**
 * The caller's row visibility AND the request's filters, as a Prisma `where`.
 *
 * Visibility is ANDed in as its own top-level clause (never merged field by
 * field), so a filter can only narrow the result. `ticketVisibilityWhere`
 * also carries `deletedAt: null`, which is why nothing below repeats it.
 */
export function analyticsTicketWhere(
  user: AuthenticatedUser,
  query: AnalyticsQueryDto,
): Prisma.TicketWhereInput {
  return {
    AND: [
      ticketVisibilityWhere(user),
      {
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      },
    ],
  };
}

/**
 * The SAME scope expressed as a raw-SQL predicate, for the aggregates Prisma
 * cannot express (a median, a per-group average duration, the pause-aware
 * at-risk count).
 *
 * Defined immediately beside its Prisma twin above, for the reason
 * `ticket-visibility.ts` and `knowledge-article-visibility.ts` both give: the
 * failure that matters here is a raw path whose scope drifts weaker than the
 * ORM path's, and adjacency is what makes that visible in review. Every
 * caller-supplied value is interpolated through a `Prisma.sql` tagged
 * template and therefore bound as a parameter — this module never
 * concatenates input into statement text and never uses `$queryRawUnsafe`.
 *
 * Assumes the `tickets` table is aliased `t`.
 */
export function analyticsTicketSql(
  user: AuthenticatedUser,
  query: AnalyticsQueryDto,
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [ticketVisibilitySql(user)];

  if (query.priority) {
    clauses.push(Prisma.sql`t.priority = ${query.priority}::"TicketPriority"`);
  }
  if (query.categoryId) {
    clauses.push(Prisma.sql`t.category_id = ${query.categoryId}::uuid`);
  }
  if (query.assigneeId) {
    clauses.push(Prisma.sql`t.assignee_id = ${query.assigneeId}::uuid`);
  }

  return Prisma.join(clauses, ' AND ');
}
