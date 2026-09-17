import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommentVisibility,
  Prisma,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { TicketAssetResponseDto } from '../assets/dto/ticket-asset-response.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ticketVisibilityWhere as buildTicketVisibilityWhere } from '../common/ticket-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { SlaService } from '../sla/sla.service';
import { TicketSlaResponseDto } from '../sla/dto/ticket-sla-response.dto';
import {
  TicketCategoriesService,
  toTicketCategoryResponse,
} from '../ticket-categories/ticket-categories.service';
import { toUserSummary, UsersService } from '../users/users.service';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketCommentsQueryDto } from './dto/list-ticket-comments-query.dto';
import { ListTicketHistoryQueryDto } from './dto/list-ticket-history-query.dto';
import { LinkTicketAssetDto } from './dto/link-ticket-asset.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import {
  TicketCommentListResponseDto,
  TicketCommentResponseDto,
} from './dto/ticket-comment-response.dto';
import {
  TicketHistoryListResponseDto,
  TicketHistoryResponseDto,
} from './dto/ticket-history-response.dto';
import {
  TicketListResponseDto,
  TicketResponseDto,
} from './dto/ticket-response.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import {
  ALLOWED_TRANSITIONS,
  isReopenTransition,
  isStaffRole,
} from './tickets.constants';

const ticketInclude = {
  requester: true,
  assignee: true,
  category: true,
  sla: true,
} as const;

type TicketWithRelations = Prisma.TicketGetPayload<{
  include: typeof ticketInclude;
}>;

function toTicketResponse(
  ticket: TicketWithRelations,
  sla: TicketSlaResponseDto | null,
): TicketResponseDto {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    reopenedCount: ticket.reopenedCount,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    requester: toUserSummary(ticket.requester),
    assignee: ticket.assignee ? toUserSummary(ticket.assignee) : null,
    category: ticket.category ? toTicketCategoryResponse(ticket.category) : null,
    sla,
  };
}

function toTicketCommentResponse(
  comment: Prisma.TicketCommentGetPayload<{ include: { author: true } }>,
): TicketCommentResponseDto {
  return {
    id: comment.id,
    body: comment.body,
    visibility: comment.visibility,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: toUserSummary(comment.author),
  };
}

function toTicketHistoryResponse(
  entry: Prisma.TicketHistoryGetPayload<{ include: { actor: true } }>,
): TicketHistoryResponseDto {
  return {
    id: entry.id,
    fieldName: entry.fieldName,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    createdAt: entry.createdAt,
    actor: entry.actor ? toUserSummary(entry.actor) : null,
  };
}

const CONFLICT_MESSAGE =
  'Ticket was modified by another request; reload and retry';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly ticketCategoriesService: TicketCategoriesService,
    private readonly slaService: SlaService,
    private readonly assetsService: AssetsService,
  ) {}

  async create(
    dto: CreateTicketDto,
    user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    if (dto.categoryId) {
      await this.assertActiveCategory(dto.categoryId);
    }

    const created = await this.runTransaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          subject: dto.subject,
          description: dto.description,
          requesterId: user.id,
          categoryId: dto.categoryId,
          priority: dto.priority ?? TicketPriority.Medium,
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          actorId: user.id,
          fieldName: 'status',
          oldValue: null,
          newValue: TicketStatus.New,
        },
      });

      // Priority-based policy selection, snapshotted onto a new TicketSla
      // row; clock start is the ticket's own DB-assigned createdAt. A
      // missing active policy never blocks creation (ADR-020).
      await this.slaService.attachOnCreate(
        tx,
        ticket.id,
        ticket.priority,
        ticket.createdAt,
      );

      return ticket;
    });

    return this.findOne(created.id, user);
  }

  async findAll(
    query: ListTicketsQueryDto,
    user: AuthenticatedUser,
  ): Promise<TicketListResponseDto> {
    // Visibility is ANDed as its own top-level clause — not spread
    // alongside the filters — so a future filter can never accidentally
    // overwrite (and thereby silently disable) the ownership scoping.
    const where: Prisma.TicketWhereInput = {
      AND: [
        this.ticketVisibilityWhere(user),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.priority ? [{ priority: query.priority }] : []),
        ...(query.categoryId ? [{ categoryId: query.categoryId }] : []),
        ...(query.assigneeId ? [{ assigneeId: query.assigneeId }] : []),
      ],
    };

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: ticketInclude,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data: tickets.map((t) => this.mapTicket(t)), total };
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    const ticket = await this.getVisibleTicketOrThrow(id, user);
    return this.mapTicket(ticket);
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    const ticket = await this.getVisibleTicketOrThrow(id, user);

    if (!isStaffRole(user.role) && ticket.status !== TicketStatus.New) {
      throw new ForbiddenException(
        'This ticket can no longer be edited by its requester',
      );
    }

    if (dto.categoryId !== undefined) {
      await this.assertActiveCategory(dto.categoryId);
    }

    const historyRows: Prisma.TicketHistoryCreateManyInput[] = [];
    // "Unchecked" variant: sets categoryId as a plain scalar FK rather
    // than via a relation `connect`, since updateMany (unlike update)
    // only accepts scalar mutations.
    const data: Prisma.TicketUncheckedUpdateManyInput = {};

    if (dto.subject !== undefined && dto.subject !== ticket.subject) {
      historyRows.push(
        this.historyRow(ticket.id, user.id, 'subject', ticket.subject, dto.subject),
      );
      data.subject = dto.subject;
    }
    if (
      dto.description !== undefined &&
      dto.description !== ticket.description
    ) {
      historyRows.push(
        this.historyRow(
          ticket.id,
          user.id,
          'description',
          ticket.description,
          dto.description,
        ),
      );
      data.description = dto.description;
    }
    if (
      dto.categoryId !== undefined &&
      dto.categoryId !== ticket.categoryId
    ) {
      historyRows.push(
        this.historyRow(
          ticket.id,
          user.id,
          'categoryId',
          ticket.categoryId,
          dto.categoryId,
        ),
      );
      data.categoryId = dto.categoryId;
    }

    if (historyRows.length === 0) {
      return this.mapTicket(ticket);
    }

    await this.runTransaction(async (tx) => {
      // Conditional update gates the write on the row being unchanged
      // since we read it (matched by `updatedAt`) and still in the
      // caller's visibility scope — two concurrent edits to the same
      // ticket can otherwise both "succeed" and leave a TicketHistory row
      // whose oldValue no longer matches what was actually overwritten.
      const updated = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          updatedAt: ticket.updatedAt,
          ...this.ticketVisibilityWhere(user),
        },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException(CONFLICT_MESSAGE);
      }
      await tx.ticketHistory.createMany({ data: historyRows });
    });

    return this.findOne(id, user);
  }

  async assign(
    id: string,
    dto: AssignTicketDto,
    user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    // Defense-in-depth: independently verify staff-only access here too,
    // not just via the controller's @Roles() guard (backend.md).
    this.assertStaff(user, 'Only staff can assign a ticket');

    const ticket = await this.getVisibleTicketOrThrow(id, user);

    const expectedCurrent = ticket.assigneeId;
    if (dto.assigneeId === expectedCurrent) {
      // No-op: nothing to validate or write. Checked before the assignee
      // lookup below so re-submitting the same assignment never fails on
      // a target that has since become inactive/changed role.
      return this.mapTicket(ticket);
    }

    if (dto.assigneeId) {
      const assignee = await this.usersService.findById(dto.assigneeId);
      if (!assignee || !assignee.isActive || !isStaffRole(assignee.role)) {
        throw new BadRequestException(
          'assigneeId must refer to an active staff user',
        );
      }
    }

    await this.runTransaction(async (tx) => {
      // Conditional update gates the write on the assignee still being
      // what we last read — closes the race where two agents both try to
      // self-assign the same unassigned ticket at once. Re-asserting
      // ticketVisibilityWhere here too (not just at the earlier read)
      // keeps the write itself in scope, not only the read that preceded
      // it — defense in depth against a future soft-delete/ownership
      // change racing this write.
      const rotated = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          assigneeId: expectedCurrent,
          ...this.ticketVisibilityWhere(user),
        },
        data: { assigneeId: dto.assigneeId },
      });
      if (rotated.count !== 1) {
        throw new ConflictException(CONFLICT_MESSAGE);
      }

      await tx.ticketHistory.create({
        data: this.historyRow(
          ticket.id,
          user.id,
          'assigneeId',
          expectedCurrent,
          dto.assigneeId,
        ),
      });
    });

    this.logger.log(
      `Ticket ${ticket.id} assignment changed by user ${user.id}`,
    );

    return this.findOne(id, user);
  }

  async updateStatus(
    id: string,
    dto: UpdateTicketStatusDto,
    user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    const ticket = await this.getVisibleTicketOrThrow(id, user);
    return this.applyStatusTransition(ticket, dto.status, user);
  }

  async updatePriority(
    id: string,
    dto: UpdateTicketPriorityDto,
    user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    this.assertStaff(user, 'Only staff can change ticket priority');

    const ticket = await this.getVisibleTicketOrThrow(id, user);

    if (ticket.priority === dto.priority) {
      return this.mapTicket(ticket);
    }

    await this.runTransaction(async (tx) => {
      // Conditional update gates the write on the priority still being
      // what we last read — matches assign()'s CAS verbatim (ADR-020
      // concurrency invariant 4). Without it, two concurrent priority
      // changes could both succeed and BOTH SLA target deltas would land.
      const updated = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          priority: ticket.priority,
          ...this.ticketVisibilityWhere(user),
        },
        data: { priority: dto.priority },
      });
      if (updated.count !== 1) {
        throw new ConflictException(CONFLICT_MESSAGE);
      }

      // SLA hook runs strictly after the CAS succeeds (ADR-020 invariant 3).
      // ticket.resolvedAt is the pre-transaction read; handlePriorityChange
      // treats a non-null value as "already resolved at least once" and
      // skips the SLA delta entirely (ADR-020).
      await this.slaService.handlePriorityChange(
        tx,
        ticket.id,
        dto.priority,
        ticket.resolvedAt,
      );

      await tx.ticketHistory.create({
        data: this.historyRow(
          ticket.id,
          user.id,
          'priority',
          ticket.priority,
          dto.priority,
        ),
      });
    });

    this.logger.log(`Ticket ${ticket.id} priority changed by user ${user.id}`);

    return this.findOne(id, user);
  }

  async createComment(
    id: string,
    dto: CreateTicketCommentDto,
    user: AuthenticatedUser,
  ): Promise<TicketCommentResponseDto> {
    const ticket = await this.getVisibleTicketOrThrow(id, user);

    const visibility = dto.visibility ?? CommentVisibility.Public;
    if (visibility === CommentVisibility.Internal && !isStaffRole(user.role)) {
      throw new ForbiddenException('Only staff can create an internal note');
    }

    const comment = await this.runTransaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticketId: id,
          authorId: user.id,
          body: dto.body,
          visibility,
        },
        include: { author: true },
      });

      // First-response qualification (ADR-020's D3): Public visibility,
      // staff-authored, and the author is not the ticket's own requester —
      // a staff user who filed their own ticket can never satisfy their
      // own response SLA, and Internal notes never qualify. The hook
      // itself is exactly-once by construction (guarded on
      // response_at IS NULL), so a race between two qualifying replies is
      // safe without any extra locking here.
      if (
        visibility === CommentVisibility.Public &&
        isStaffRole(user.role) &&
        user.id !== ticket.requesterId
      ) {
        await this.slaService.recordFirstResponse(tx, id, created.createdAt);
      }

      return created;
    });

    return toTicketCommentResponse(comment);
  }

  async findComments(
    id: string,
    query: ListTicketCommentsQueryDto,
    user: AuthenticatedUser,
  ): Promise<TicketCommentListResponseDto> {
    await this.getVisibleTicketOrThrow(id, user);

    // Applied to BOTH findMany and count: filtering only the rows while
    // leaving `total` unfiltered would leak how many internal notes exist
    // to an Employee who can't see them.
    const where: Prisma.TicketCommentWhereInput = {
      ticketId: id,
      deletedAt: null,
      ...(isStaffRole(user.role)
        ? {}
        : { visibility: CommentVisibility.Public }),
    };

    const [comments, total] = await Promise.all([
      this.prisma.ticketComment.findMany({
        where,
        include: { author: true },
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.ticketComment.count({ where }),
    ]);

    return { data: comments.map(toTicketCommentResponse), total };
  }

  async findHistory(
    id: string,
    query: ListTicketHistoryQueryDto,
    user: AuthenticatedUser,
  ): Promise<TicketHistoryListResponseDto> {
    this.assertStaff(user, 'Only staff can view ticket history');

    await this.getVisibleTicketOrThrow(id, user);

    const where: Prisma.TicketHistoryWhereInput = { ticketId: id };

    const [entries, total] = await Promise.all([
      this.prisma.ticketHistory.findMany({
        where,
        include: { actor: true },
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.ticketHistory.count({ where }),
    ]);

    return { data: entries.map(toTicketHistoryResponse), total };
  }

  /**
   * Assets linked to a ticket. Like findComments/findHistory, the ticket
   * lookup is routed through the visibility helper FIRST: a ticket the
   * caller cannot see is a 404 that reveals nothing about whether any
   * assets are linked to it.
   */
  async findAssets(
    id: string,
    user: AuthenticatedUser,
  ): Promise<TicketAssetResponseDto[]> {
    await this.getVisibleTicketOrThrow(id, user);
    return this.assetsService.findForTicket(id);
  }

  async linkAsset(
    id: string,
    dto: LinkTicketAssetDto,
    user: AuthenticatedUser,
  ): Promise<TicketAssetResponseDto> {
    this.assertStaff(user, 'Only staff can link an asset to a ticket');

    await this.getVisibleTicketOrThrow(id, user);

    return this.assetsService.linkToTicket(id, dto.assetId, user);
  }

  async unlinkAsset(
    id: string,
    assetId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    this.assertStaff(user, 'Only staff can unlink an asset from a ticket');

    await this.getVisibleTicketOrThrow(id, user);

    await this.assetsService.unlinkFromTicket(id, assetId, user);
  }

  /**
   * The single seam every status change funnels through. SLA hooks
   * (ADR-020) run here, strictly after the CAS below succeeds:
   * - Entering OnHold pauses both clocks (pauseForHold).
   * - Leaving OnHold (to ANY destination) resumes and credits the pause
   *   (resumeFromPause) — this MUST run before the resolution-outcome hook
   *   below, or a resolution reached straight out of OnHold would be
   *   compared against a still-unshifted resolutionDueAt and record a
   *   breach the team didn't cause.
   * - Reopening (the only path, Resolved -> Open) reuses the IDENTICAL
   *   resumeFromPause call as the D4 pause-credit mechanism: the anchor
   *   was set to resolvedAt by recordResolutionOutcome when the ticket
   *   resolved, so "resume" and "reopen credit" are the same computation.
   * - Resolving (resolvedAt going null -> set, for both ->Resolved and a
   *   direct ->Closed) records the resolution outcome and sets the D4
   *   pause anchor for a possible future reopen.
   */
  private async applyStatusTransition(
    ticket: TicketWithRelations,
    newStatus: TicketStatus,
    user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    const currentStatus = ticket.status;

    if (currentStatus === newStatus) {
      throw new BadRequestException(
        `Ticket is already in status ${newStatus}`,
      );
    }

    const staff = isStaffRole(user.role);
    const reopening = isReopenTransition(currentStatus, newStatus);

    // ALLOWED_TRANSITIONS is consulted for every caller, staff or not —
    // not a role-gated bypass of it — so editing the matrix can never
    // silently leave a requester able to do something staff no longer
    // can.
    if (!ALLOWED_TRANSITIONS[currentStatus].includes(newStatus)) {
      throw new ForbiddenException(
        `Cannot transition a ticket from ${currentStatus} to ${newStatus}`,
      );
    }
    if (!staff && !reopening) {
      // The ticket's own requester (guaranteed by getVisibleTicketOrThrow
      // having already scoped this ticket to them) may only reopen.
      throw new ForbiddenException(
        'Only staff can change a ticket to this status',
      );
    }

    const now = new Date();
    const data: Prisma.TicketUpdateManyMutationInput = { status: newStatus };

    if (newStatus === TicketStatus.Resolved && !ticket.resolvedAt) {
      data.resolvedAt = now;
    }
    if (newStatus === TicketStatus.Closed) {
      data.closedAt = now;
      if (!ticket.resolvedAt) {
        data.resolvedAt = now;
      }
    }
    if (reopening) {
      data.resolvedAt = null;
      data.closedAt = null;
      data.reopenedCount = { increment: 1 };
    }

    await this.runTransaction(async (tx) => {
      // Conditional update gates the write on the status still being what
      // we last read — two concurrent transitions can otherwise both pass
      // the validation above and leave a TicketHistory row whose oldValue
      // is a lie. ticketVisibilityWhere is re-asserted here too, not just
      // at the earlier read, for the same defense-in-depth reason as
      // assign()'s CAS above.
      const updated = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          status: currentStatus,
          ...this.ticketVisibilityWhere(user),
        },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException(CONFLICT_MESSAGE);
      }

      // SLA hooks run strictly after the CAS succeeds (ADR-020 invariant
      // 3), in the order documented above this method.
      if (currentStatus === TicketStatus.OnHold) {
        await this.slaService.resumeFromPause(tx, ticket.id);
      }
      if (newStatus === TicketStatus.OnHold) {
        await this.slaService.pauseForHold(tx, ticket.id);
      }
      if (reopening) {
        await this.slaService.resumeFromPause(tx, ticket.id);
      }
      if (data.resolvedAt) {
        // Only ever truthy here when resolvedAt is going null -> set (see
        // the assignment logic above) — never on the reopening branch,
        // which explicitly sets it back to null.
        await this.slaService.recordResolutionOutcome(tx, ticket.id);
      }

      const historyRows: Prisma.TicketHistoryCreateManyInput[] = [
        this.historyRow(ticket.id, user.id, 'status', currentStatus, newStatus),
      ];
      if (reopening) {
        historyRows.push(
          this.historyRow(
            ticket.id,
            user.id,
            'reopened_count',
            String(ticket.reopenedCount),
            String(ticket.reopenedCount + 1),
          ),
        );
      }
      await tx.ticketHistory.createMany({ data: historyRows });
    });

    this.logger.log(
      `Ticket ${ticket.id} status changed ${currentStatus} -> ${newStatus} by user ${user.id}`,
    );

    return this.findOne(ticket.id, user);
  }

  /** Wraps the ticket + its SLA relation into the API response shape,
   * deriving SLA breach/at-risk state at read time (ADR-020). */
  private mapTicket(ticket: TicketWithRelations): TicketResponseDto {
    return toTicketResponse(
      ticket,
      this.slaService.toTicketSlaResponse(ticket.sla, ticket),
    );
  }

  private ticketVisibilityWhere(user: AuthenticatedUser): Prisma.TicketWhereInput {
    return buildTicketVisibilityWhere(user);
  }

  private assertStaff(user: AuthenticatedUser, message: string): void {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException(message);
    }
  }

  private async getVisibleTicketOrThrow(
    id: string,
    user: AuthenticatedUser,
  ): Promise<TicketWithRelations> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, ...this.ticketVisibilityWhere(user) },
      include: ticketInclude,
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  private async assertActiveCategory(categoryId: string): Promise<void> {
    const category = await this.ticketCategoriesService.findActiveById(
      categoryId,
    );
    if (!category) {
      throw new BadRequestException(
        'categoryId does not refer to an active ticket category',
      );
    }
  }

  private historyRow(
    ticketId: string,
    actorId: string,
    fieldName: string,
    oldValue: string | null,
    newValue: string | null,
  ): Prisma.TicketHistoryCreateManyInput {
    return { ticketId, actorId, fieldName, oldValue, newValue };
  }

  private async runTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (error) {
      return this.mapPrismaError(error);
    }
  }

  private mapPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new BadRequestException('Referenced record no longer exists');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Ticket not found');
      }
    }
    throw error as Error;
  }
}
