import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma, TicketPriority, TicketSla, TicketStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ticketVisibilityWhere } from '../common/ticket-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { isStaffRole } from '../tickets/tickets.constants';
import { SlaMetricsResponseDto } from './dto/sla-metrics-response.dto';
import { SlaPolicyResponseDto } from './dto/sla-policy-response.dto';
import { TicketSlaResponseDto } from './dto/ticket-sla-response.dto';
import {
  computeDueDates,
  deriveResolutionState,
  deriveResponseState,
  isPausedFromStatus,
  remainingMinutes,
} from './sla.calculations';

/** The subset of a Ticket the read-model mapper needs beyond the SLA row
 * itself: `status` decides `isPaused`, `resolvedAt` decides the response
 * clock's `NoResponse` outcome and the resolution clock's completion. */
export interface TicketSlaContext {
  status: TicketStatus;
  resolvedAt: Date | null;
}

/**
 * Phase 7 — SLA Management. See DECISIONS.md ADR-020 for the full design
 * (priority-only policy selection, snapshot-at-attach immutability, pause
 * as due-date shifting, the D4 resolve/reopen pause-credit mechanism, and
 * the D3 first-response rules).
 *
 * Every hook below takes `Prisma.TransactionClient` as its first argument
 * and never opens its own transaction — the caller (TicketsService) owns
 * the transaction boundary and is responsible for calling these strictly
 * AFTER the corresponding ticket CAS/update has already succeeded, never
 * before and never on a failed CAS (ADR-020, concurrency invariant 3).
 *
 * Every SLA date mutation below is a pure additive/commutative delta
 * (`due_at = due_at + delta`), never an absolute reconstruction, and never
 * reads an SLA timing anchor from outside the very statement that consumes
 * it — both are concurrency invariants 1 and 2 from ADR-020. Raw SQL is
 * confined to this file, behind these typed methods, and is always a
 * parameterized `$executeRaw` tagged template — never `$executeRawUnsafe`.
 *
 * `SlaService` must never import `TicketsService` — the dependency
 * direction is `tickets -> sla` only, so `tickets.constants.ts`'s
 * `isStaffRole` (a dependency-free pure function, not the service) is
 * reused here rather than duplicating the staff-role list.
 */
@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Hooks (called from inside TicketsService's transaction)
  // ---------------------------------------------------------------------

  /**
   * Attaches a TicketSla row at ticket creation, selecting the active
   * policy for the ticket's priority (priority is the ONLY selection
   * criterion — ADR-020). The policy's targets are snapshotted onto the
   * row so a later policy edit/delete never retroactively changes this
   * ticket's commitment. Clock start is the ticket's own DB-assigned
   * `createdAt`. If no active policy exists for the priority, the ticket
   * is created WITHOUT an SLA and this is only ever a warning — intake
   * must never be blocked by an SLA configuration gap.
   */
  async attachOnCreate(
    tx: Prisma.TransactionClient,
    ticketId: string,
    priority: TicketPriority,
    createdAt: Date,
  ): Promise<void> {
    const policy = await tx.slaPolicy.findFirst({
      where: { priority, isActive: true },
    });
    if (!policy) {
      this.logger.warn(
        `No active SLA policy for priority ${priority}; ticket ${ticketId} was created without an SLA.`,
      );
      return;
    }

    const { responseDueAt, resolutionDueAt } = computeDueDates(
      createdAt,
      policy.responseTimeMinutes,
      policy.resolutionTimeMinutes,
    );

    await tx.ticketSla.create({
      data: {
        ticketId,
        slaPolicyId: policy.id,
        responseTargetMinutes: policy.responseTimeMinutes,
        resolutionTargetMinutes: policy.resolutionTimeMinutes,
        responseDueAt,
        resolutionDueAt,
      },
    });
  }

  /**
   * Records the ticket's first qualifying response. The caller
   * (TicketsService.createComment) is responsible for deciding whether a
   * given comment qualifies (Public visibility, staff author, author is
   * not the ticket's own requester) — this method only performs the
   * exactly-once write, guarded by `response_at IS NULL` so a second
   * qualifying reply (including two concurrent ones) is a silent no-op
   * after the first commits. Uses the inserted comment's OWN `createdAt`
   * (passed in as `respondedAt`) — never a separately-read clock — and
   * NEVER fabricates a response that did not happen.
   *
   * `responseBreached` is only ever set here, i.e. only once `responseAt`
   * is actually being set — an incomplete clock's `responseBreached`
   * column is left at its default `false` and breach is derived on read
   * instead (D3, ADR-020).
   *
   * A reply CAN arrive while `on_hold_started_at` is set — the ticket is
   * OnHold, or Resolved-pending-reopen (D4's dual use of the same anchor)
   * — and `response_due_at` has NOT been shifted yet in that case (the
   * shift only happens on resume). Comparing `respondedAt` against the
   * still-unshifted due date would falsely burn down a paused clock,
   * exactly what D3 exists to prevent. Instead, breach is decided by
   * whether the pause/stop ITSELF started after the due date had already
   * passed (`on_hold_started_at > response_due_at`) — equivalent to
   * crediting the elapsed pause up to the moment of this reply, and
   * consistent with `remainingMinutes`' pause-freeze semantics. Both
   * sides are read from the row inside this same statement (never a
   * value from outside it — concurrency invariant 2).
   */
  async recordFirstResponse(
    tx: Prisma.TransactionClient,
    ticketId: string,
    respondedAt: Date,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE ticket_sla
         SET response_at = ${respondedAt}::timestamptz,
             response_breached = CASE
               WHEN on_hold_started_at IS NOT NULL THEN on_hold_started_at > response_due_at
               ELSE ${respondedAt}::timestamptz > response_due_at
             END,
             updated_at = now()
       WHERE ticket_id = ${ticketId}::uuid AND response_at IS NULL
    `;
  }

  /**
   * Entering OnHold: sets the pause anchor using the DATABASE clock (never
   * `new Date()`), so the later resume statement's `now() - on_hold_started_at`
   * is computed entirely within one clock domain. Guarded by
   * `on_hold_started_at IS NULL` so it is idempotent if ever called twice.
   */
  async pauseForHold(tx: Prisma.TransactionClient, ticketId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE ticket_sla
         SET on_hold_started_at = now(),
             updated_at = now()
       WHERE ticket_id = ${ticketId}::uuid AND on_hold_started_at IS NULL
    `;
  }

  /**
   * Resume / pause-credit — ONE statement, TWO call sites (ADR-020's D4):
   * (a) leaving OnHold, for every outgoing destination status, and
   * (b) reopening a Resolved ticket (the only reopen path, Resolved ->
   * Open), which credits the resolved-to-reopen interval by reusing this
   * exact mechanism — `on_hold_started_at` was set to `resolved_at` by
   * `recordResolutionOutcome` below, so "resume" and "reopen credit" are
   * literally the same computation against the same column, which now
   * serves two mutually exclusive purposes ("paused for OnHold" and
   * "stopped pending reopen"). They cannot conflict: `status` is a single
   * enum value, and OnHold -> Resolved always clears the anchor via this
   * same method BEFORE `recordResolutionOutcome` sets it again (see the
   * ordering requirement on that method).
   *
   * Reads `on_hold_started_at` from the row as currently committed —
   * never a value read earlier outside this statement — which is what
   * makes this immune to the ABA hazard of a concurrent
   * Resolved -> Open -> ... -> Resolved cycle: a stale pre-transaction
   * `ticket.resolvedAt` would silently over-credit, this never reads one.
   *
   * `total_paused_minutes` is accumulated here for DISPLAY ONLY — it is
   * never read back into an authoritative SLA calculation.
   *
   * Also clears `resolution_breached` back to its default `false`. This
   * matters only for the reopen call site: `resolution_breached` can only
   * be non-default-false here if the ticket was PREVIOUSLY resolved (D4
   * set this exact anchor), reopened, and is now leaving a LATER OnHold —
   * without this reset that stale `true` from the earlier, since-undone
   * resolution would still be counted by `getMetrics`' `resolutionBreached:
   * true` aggregate for a ticket that is no longer resolved at all. Safe
   * to reset unconditionally on every resume: for the plain
   * leaving-OnHold call site the column is always still at its default
   * `false` (a ticket cannot reach OnHold — see ALLOWED_TRANSITIONS —
   * directly from Resolved, only via a reopen, which already clears it
   * here first).
   */
  async resumeFromPause(tx: Prisma.TransactionClient, ticketId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE ticket_sla
         SET response_due_at   = response_due_at   + (now() - on_hold_started_at),
             resolution_due_at = resolution_due_at + (now() - on_hold_started_at),
             total_paused_minutes = total_paused_minutes
                 + round(extract(epoch from (now() - on_hold_started_at)) / 60)::integer,
             resolution_breached = false,
             on_hold_started_at = NULL,
             updated_at = now()
       WHERE ticket_id = ${ticketId}::uuid AND on_hold_started_at IS NOT NULL
    `;
  }

  /**
   * Priority change: a pure commutative delta computed entirely inside the
   * UPDATE against the row's CURRENTLY stored target minutes (read inside
   * this same statement, never passed in from an earlier read) — so a
   * concurrent pause/resume racing this statement is never silently
   * discarded by an absolute overwrite (ADR-020, concurrency invariants 1
   * and 2). Both target columns move together in this one statement.
   */
  async applyPriorityDelta(
    tx: Prisma.TransactionClient,
    ticketId: string,
    newResponseTargetMinutes: number,
    newResolutionTargetMinutes: number,
    newPolicyId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE ticket_sla
         SET response_due_at   = response_due_at   + (${newResponseTargetMinutes}::integer   - response_target_minutes)   * interval '1 minute',
             resolution_due_at = resolution_due_at + (${newResolutionTargetMinutes}::integer - resolution_target_minutes) * interval '1 minute',
             response_target_minutes = ${newResponseTargetMinutes}::integer,
             resolution_target_minutes = ${newResolutionTargetMinutes}::integer,
             sla_policy_id = ${newPolicyId}::uuid,
             updated_at = now()
       WHERE ticket_id = ${ticketId}::uuid
    `;
  }

  /**
   * Re-derives a ticket's SLA targets for a new priority and applies the
   * delta, preserving the original clock start (never resets the cycle,
   * never recomputes a completed clock's persisted breach flag). If no
   * active policy exists for the new priority, the existing snapshot is
   * left untouched and this is only ever a warning — an SLA configuration
   * gap must never block a priority change from succeeding. A no-op if the
   * ticket has no TicketSla row at all (e.g. it was created when no policy
   * was active): the guarded UPDATE simply matches zero rows.
   *
   * `ticketResolvedAt` (the ticket's OWN `resolvedAt` as already read by
   * the caller) gates a second, equally deliberate no-op: once a ticket
   * has resolved at least once (resolvedAt set — regardless of whether it
   * has since reopened, which the caller reflects by passing `null`
   * again), both clocks are conceptually complete or paused-pending-
   * reopen, and their due dates must never be shifted further — matching
   * D8's "a persisted breach flag, once set, is never reconsidered."
   * Priority changes on a Resolved/Closed ticket remain a normal, allowed
   * ticket operation (Phase 6a is unchanged); only the SLA side-effect is
   * skipped, with a warning, exactly like the missing-policy case above.
   */
  async handlePriorityChange(
    tx: Prisma.TransactionClient,
    ticketId: string,
    newPriority: TicketPriority,
    ticketResolvedAt: Date | null,
  ): Promise<void> {
    if (ticketResolvedAt !== null) {
      this.logger.warn(
        `Ticket ${ticketId} has already resolved at least once; its SLA snapshot was left unchanged by this priority change.`,
      );
      return;
    }
    const policy = await tx.slaPolicy.findFirst({
      where: { priority: newPriority, isActive: true },
    });
    if (!policy) {
      this.logger.warn(
        `No active SLA policy for priority ${newPriority}; ticket ${ticketId}'s SLA targets were left unchanged.`,
      );
      return;
    }
    await this.applyPriorityDelta(
      tx,
      ticketId,
      policy.responseTimeMinutes,
      policy.resolutionTimeMinutes,
      policy.id,
    );
  }

  /**
   * Resolution outcome + the D4 pause anchor (ADR-020). Called only when a
   * transition is setting `resolvedAt` for the first time (both ->Resolved
   * and a direct ->Closed). Reads the authoritative `resolved_at` this
   * SAME transaction just wrote (via the `tickets` join) — never a value
   * fabricated or read outside this statement (no `responseAt` fabrication
   * either, per D3).
   *
   * Sets `on_hold_started_at = now()` (the DATABASE clock, not
   * `t.resolved_at`) — re-purposing the column as a general "clock
   * stopped at" anchor for a second, mutually exclusive reason beyond
   * OnHold: "resolved, pending a possible reopen". `t.resolved_at` is
   * written by the caller from `new Date()` in application code (a
   * pre-existing Phase 6a field, not a DB-computed default), so using it
   * as this anchor would let a later reopen's `resumeFromPause` compute
   * `now() - on_hold_started_at` across TWO different clock domains
   * (app-clock anchor, DB-clock `now()`) — precisely what ADR-020
   * requires this anchor to avoid. `now()` keeps the anchor itself
   * DB-clock, at the cost of a sub-statement-latency (not app-round-trip)
   * gap between the true resolution instant and this anchor — negligible,
   * and confined to display-only `total_paused_minutes` plus the
   * pause-credit delta, never to `resolutionBreached` (which is still
   * decided from the real `t.resolved_at` below, once, right here). The
   * `s.on_hold_started_at IS NULL` guard makes this idempotent and is
   * always satisfied here because the caller's ordering (see
   * `resumeFromPause` above) already clears the anchor before this runs
   * whenever the ticket was leaving OnHold. For a ticket going straight to
   * Closed without ever having been OnHold, the anchor this sets is
   * inert — Closed is terminal, so it is never read again.
   */
  async recordResolutionOutcome(tx: Prisma.TransactionClient, ticketId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE ticket_sla s
         SET resolution_breached = (t.resolved_at > s.resolution_due_at),
             on_hold_started_at  = now(),
             updated_at = now()
        FROM tickets t
       WHERE t.id = s.ticket_id AND s.ticket_id = ${ticketId}::uuid AND s.on_hold_started_at IS NULL
    `;
  }

  // ---------------------------------------------------------------------
  // Read model
  // ---------------------------------------------------------------------

  /**
   * Maps a TicketSla row (or null) plus its ticket's status/resolvedAt to
   * the API shape. NEVER writes. Breach for an incomplete clock is derived
   * here at read time rather than trusted from the persisted column — the
   * persisted `responseBreached`/`resolutionBreached` flags are only
   * trustworthy once the corresponding clock has actually completed
   * (`responseAt`/`resolvedAt` set); see ADR-020's warning to Phase 10
   * against filtering on those columns naively.
   */
  toTicketSlaResponse(
    sla: TicketSla | null,
    ticket: TicketSlaContext,
    now: Date = new Date(),
  ): TicketSlaResponseDto | null {
    if (!sla) {
      return null;
    }

    const isPaused = isPausedFromStatus(ticket.status);
    const pauseAnchor = isPaused ? sla.onHoldStartedAt : null;

    const responseMinutesRemaining = remainingMinutes(
      sla.responseDueAt,
      now,
      isPaused,
      pauseAnchor,
    );
    const resolutionMinutesRemaining = remainingMinutes(
      sla.resolutionDueAt,
      now,
      isPaused,
      pauseAnchor,
    );

    const responseState = deriveResponseState({
      responseAt: sla.responseAt,
      responseBreachedPersisted: sla.responseBreached,
      responseDueAt: sla.responseDueAt,
      resolvedAt: ticket.resolvedAt,
      isPaused,
      now,
      remainingMinutes: responseMinutesRemaining,
      targetMinutes: sla.responseTargetMinutes,
    });

    const resolutionState = deriveResolutionState({
      resolvedAt: ticket.resolvedAt,
      resolutionBreachedPersisted: sla.resolutionBreached,
      resolutionDueAt: sla.resolutionDueAt,
      isPaused,
      now,
      remainingMinutes: resolutionMinutesRemaining,
      targetMinutes: sla.resolutionTargetMinutes,
    });

    return {
      responseTargetMinutes: sla.responseTargetMinutes,
      resolutionTargetMinutes: sla.resolutionTargetMinutes,
      responseDueAt: sla.responseDueAt,
      responseAt: sla.responseAt,
      responseState,
      responseMinutesRemaining,
      resolutionDueAt: sla.resolutionDueAt,
      resolutionState,
      resolutionMinutesRemaining,
      isPaused,
      totalPausedMinutes: sla.totalPausedMinutes,
    };
  }

  // ---------------------------------------------------------------------
  // Staff-only reads
  // ---------------------------------------------------------------------

  /** `GET /api/v1/sla-policies`. Read-only — there is no policy CRUD in
   * Phase 7. Service-layer staff check, defense-in-depth beyond the
   * controller's `@Roles()` guard (matches assign()/updatePriority()/
   * findHistory() in TicketsService). */
  async findPolicies(user: AuthenticatedUser): Promise<SlaPolicyResponseDto[]> {
    this.assertStaff(user);

    const policies = await this.prisma.slaPolicy.findMany({
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
    return policies.map(toSlaPolicyResponse);
  }

  /**
   * `GET /api/v1/sla/metrics`. Staff-only, same double gate as
   * `findPolicies`. Every count is a typed Prisma `count()` — no unbounded
   * `findMany`, no raw SQL — scoped through `ticketVisibilityWhere` so the
   * scoping travels automatically if this route's role gate is ever
   * loosened. At-risk is deliberately NOT included as an aggregate (see
   * SlaMetricsResponseDto); a single `now` is captured once and reused
   * across every count so the counts are mutually consistent.
   */
  async getMetrics(user: AuthenticatedUser): Promise<SlaMetricsResponseDto> {
    this.assertStaff(user);

    const now = new Date();
    const visibility = ticketVisibilityWhere(user);
    const scoped = (extra: Prisma.TicketWhereInput): Prisma.TicketWhereInput => ({
      AND: [visibility, extra],
    });

    const [
      openWithSla,
      resolutionBreachedInFlight,
      resolutionBreachedCompleted,
      respondedOnTime,
      respondedLate,
      responseOverdueOutstanding,
      neverResponded,
    ] = await Promise.all([
      this.prisma.ticket.count({
        where: scoped({ deletedAt: null, resolvedAt: null, sla: { isNot: null } }),
      }),
      this.prisma.ticket.count({
        where: scoped({
          resolvedAt: null,
          status: { not: TicketStatus.OnHold },
          sla: { resolutionDueAt: { lt: now } },
        }),
      }),
      this.prisma.ticket.count({
        where: scoped({ sla: { resolutionBreached: true } }),
      }),
      this.prisma.ticket.count({
        where: scoped({ sla: { responseAt: { not: null }, responseBreached: false } }),
      }),
      this.prisma.ticket.count({
        where: scoped({ sla: { responseAt: { not: null }, responseBreached: true } }),
      }),
      this.prisma.ticket.count({
        where: scoped({
          resolvedAt: null,
          status: { not: TicketStatus.OnHold },
          sla: { responseAt: null, responseDueAt: { lt: now } },
        }),
      }),
      this.prisma.ticket.count({
        where: scoped({ resolvedAt: { not: null }, sla: { responseAt: null } }),
      }),
    ]);

    return {
      openWithSla,
      resolutionBreachedInFlight,
      resolutionBreachedCompleted,
      respondedOnTime,
      respondedLate,
      responseOverdueOutstanding,
      neverResponded,
    };
  }

  private assertStaff(user: AuthenticatedUser): void {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException('Only staff can access SLA data');
    }
  }
}

export function toSlaPolicyResponse(policy: {
  id: string;
  name: string;
  priority: TicketPriority;
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  isActive: boolean;
}): SlaPolicyResponseDto {
  return {
    id: policy.id,
    name: policy.name,
    priority: policy.priority,
    responseTimeMinutes: policy.responseTimeMinutes,
    resolutionTimeMinutes: policy.resolutionTimeMinutes,
    isActive: policy.isActive,
  };
}
