import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, Prisma } from '@prisma/client';
import { AssetTypesService, toAssetTypeResponse } from '../asset-types/asset-types.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { assetVisibilityWhere as buildAssetVisibilityWhere } from '../common/asset-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { isStaffRole } from '../tickets/tickets.constants';
import { toUserSummary, UsersService } from '../users/users.service';
import { isAssignableStatus } from './assets.constants';
import { AssignAssetDto } from './dto/assign-asset.dto';
import {
  AssetAssignmentListResponseDto,
  AssetAssignmentResponseDto,
} from './dto/asset-assignment-response.dto';
import { AssetListResponseDto, AssetResponseDto } from './dto/asset-response.dto';
import { AssetSummaryResponseDto } from './dto/asset-summary-response.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { ListAssetAssignmentsQueryDto } from './dto/list-asset-assignments-query.dto';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto';
import { TicketAssetResponseDto } from './dto/ticket-asset-response.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

const assetInclude = {
  assetType: true,
  currentAssignee: true,
} as const;

type AssetWithRelations = Prisma.AssetGetPayload<{
  include: typeof assetInclude;
}>;

const assignmentInclude = {
  assignedTo: true,
  assignedBy: true,
} as const;

type AssignmentWithRelations = Prisma.AssetAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

// Deliberately narrower than `assetInclude`: a ticket link only ever
// renders an AssetSummaryResponseDto, so the holder relation is not
// loaded at all and cannot leak through this route by accident.
const ticketAssetInclude = {
  asset: { include: { assetType: true } },
  linkedBy: true,
} as const;

type TicketAssetWithRelations = Prisma.TicketAssetGetPayload<{
  include: typeof ticketAssetInclude;
}>;

const CONFLICT_MESSAGE =
  'Asset was modified by another request; reload and retry';

export function toAssetResponse(asset: AssetWithRelations): AssetResponseDto {
  return {
    id: asset.id,
    assetTag: asset.assetTag,
    name: asset.name,
    status: asset.status,
    serialNumber: asset.serialNumber,
    purchaseDate: asset.purchaseDate,
    warrantyExpiresAt: asset.warrantyExpiresAt,
    notes: asset.notes,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    assetType: toAssetTypeResponse(asset.assetType),
    currentAssignee: asset.currentAssignee
      ? toUserSummary(asset.currentAssignee)
      : null,
  };
}

function toAssetAssignmentResponse(
  assignment: AssignmentWithRelations,
): AssetAssignmentResponseDto {
  return {
    id: assignment.id,
    assetId: assignment.assetId,
    assignedAt: assignment.assignedAt,
    returnedAt: assignment.returnedAt,
    notes: assignment.notes,
    assignedTo: toUserSummary(assignment.assignedTo),
    assignedBy: toUserSummary(assignment.assignedBy),
  };
}

/**
 * The projection used wherever an asset is EMBEDDED in another resource.
 *
 * The ticket-link list answers "which assets is this ticket about", not
 * "tell me everything about this asset": serialNumber, staff-authored
 * notes and the current holder stay behind GET /assets/:id, which is
 * row-scoped by `common/asset-visibility.ts`. Uniform for every role on
 * purpose — a single shape means there is no role-dependent projection to
 * get wrong. See AssetSummaryResponseDto.
 */
export function toAssetSummaryResponse(
  asset: Prisma.AssetGetPayload<{ include: { assetType: true } }>,
): AssetSummaryResponseDto {
  return {
    id: asset.id,
    assetTag: asset.assetTag,
    name: asset.name,
    status: asset.status,
    assetType: toAssetTypeResponse(asset.assetType),
  };
}

function toTicketAssetResponse(
  link: TicketAssetWithRelations,
): TicketAssetResponseDto {
  return {
    ticketId: link.ticketId,
    linkedAt: link.linkedAt,
    linkedBy: link.linkedBy ? toUserSummary(link.linkedBy) : null,
    asset: toAssetSummaryResponse(link.asset),
  };
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly assetTypesService: AssetTypesService,
  ) {}

  async create(
    dto: CreateAssetDto,
    user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    // Defense-in-depth: independently verify staff-only access here too,
    // not just via the controller's @Roles() guard (backend.md).
    this.assertStaff(user, 'Only staff can create an asset');

    await this.assertActiveAssetType(dto.assetTypeId);

    const created = await this.runTransaction((tx) =>
      tx.asset.create({
        data: {
          assetTag: dto.assetTag,
          name: dto.name,
          assetTypeId: dto.assetTypeId,
          serialNumber: dto.serialNumber,
          purchaseDate: dto.purchaseDate,
          warrantyExpiresAt: dto.warrantyExpiresAt,
          notes: dto.notes,
          // An asset is always born unassigned: assignment is only ever
          // performed through updateAssignment(), which writes status and
          // currentAssigneeId together.
          status: AssetStatus.InStock,
          currentAssigneeId: null,
        },
      }),
    );

    this.logger.log(`Asset ${created.id} created by user ${user.id}`);

    return this.findOne(created.id, user);
  }

  async findAll(
    query: ListAssetsQueryDto,
    user: AuthenticatedUser,
  ): Promise<AssetListResponseDto> {
    // Visibility is ANDed as its own top-level clause — not spread
    // alongside the filters — so a filter (e.g. `assigneeId`) can never
    // overwrite, and thereby silently disable, the ownership scoping.
    const where: Prisma.AssetWhereInput = {
      AND: [
        this.assetVisibilityWhere(user),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.assetTypeId ? [{ assetTypeId: query.assetTypeId }] : []),
        ...(query.assigneeId
          ? [{ currentAssigneeId: query.assigneeId }]
          : []),
        ...(query.q ? [this.searchWhere(query.q)] : []),
      ],
    };

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: assetInclude,
        take: query.limit,
        skip: query.offset,
        // Inventory reads naturally by tag; `id` is the stable
        // tie-breaker that keeps pagination deterministic.
        orderBy: [{ assetTag: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.asset.count({ where }),
    ]);

    return { data: assets.map(toAssetResponse), total };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<AssetResponseDto> {
    const asset = await this.getVisibleAssetOrThrow(id, user);
    return toAssetResponse(asset);
  }

  async update(
    id: string,
    dto: UpdateAssetDto,
    user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    this.assertStaff(user, 'Only staff can update an asset');

    const asset = await this.getVisibleAssetOrThrow(id, user);

    if (dto.assetTypeId !== undefined) {
      await this.assertActiveAssetType(dto.assetTypeId);
    }

    // "Unchecked" variant: sets assetTypeId as a plain scalar FK rather
    // than via a relation `connect`, since updateMany (unlike update)
    // only accepts scalar mutations.
    const data: Prisma.AssetUncheckedUpdateManyInput = {};

    if (dto.status !== undefined) {
      // Validated whenever a status is submitted at all — including a
      // submission equal to the current status — so `status: "Assigned"`
      // is always an explicit error here rather than silently ignored
      // when the asset happens to already be Assigned.
      this.assertNonAssignmentStatusChange(asset, dto.status);
      if (dto.status !== asset.status) {
        data.status = dto.status;
      }
    }
    if (dto.name !== undefined && dto.name !== asset.name) {
      data.name = dto.name;
    }
    if (dto.assetTypeId !== undefined && dto.assetTypeId !== asset.assetTypeId) {
      data.assetTypeId = dto.assetTypeId;
    }
    if (dto.serialNumber !== undefined && dto.serialNumber !== asset.serialNumber) {
      data.serialNumber = dto.serialNumber;
    }
    if (dto.notes !== undefined && dto.notes !== asset.notes) {
      data.notes = dto.notes;
    }
    if (dto.purchaseDate !== undefined) {
      data.purchaseDate = dto.purchaseDate;
    }
    if (dto.warrantyExpiresAt !== undefined) {
      data.warrantyExpiresAt = dto.warrantyExpiresAt;
    }

    if (Object.keys(data).length === 0) {
      return toAssetResponse(asset);
    }

    await this.runTransaction(async (tx) => {
      // Conditional update gates the write on the row being unchanged
      // since we read it (matched by `updatedAt`) and still in the
      // caller's visibility scope. In particular it closes the window
      // where an assignment lands between the status validation above and
      // this write — which would otherwise let a status change reach an
      // asset that has just acquired an assignee.
      const updated = await tx.asset.updateMany({
        // Visibility is ANDed as its own clause rather than spread in
        // alongside the CAS pins, exactly as findAll builds its filters:
        // spreading lets a key collision silently replace a pin, so the
        // two concerns are kept in separate objects where they cannot
        // overwrite each other.
        where: {
          AND: [
            this.assetVisibilityWhere(user),
            { id: asset.id, updatedAt: asset.updatedAt },
          ],
        },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException(CONFLICT_MESSAGE);
      }
    });

    return this.findOne(id, user);
  }

  /**
   * The single seam every assignment change funnels through, so that
   * `status` and `currentAssigneeId` are only ever written together and
   * the AssetAssignment ledger always mirrors them:
   * - assign   -> status Assigned, assignee set, a new ledger row opened
   *               (any stale open row is defensively closed first)
   * - return   -> status InStock, assignee cleared, open ledger row closed
   * - reassign -> both of the above, in one transaction
   */
  async updateAssignment(
    id: string,
    dto: AssignAssetDto,
    user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    this.assertStaff(user, 'Only staff can change an asset assignment');

    const asset = await this.getVisibleAssetOrThrow(id, user);

    const expectedAssigneeId = asset.currentAssigneeId;
    const expectedStatus = asset.status;

    if (dto.assignedToId === expectedAssigneeId) {
      // No-op: re-assigning to the current holder, or returning an asset
      // that is already unassigned. Checked before the target lookup
      // below so re-submitting the same assignment never fails on a user
      // who has since become inactive.
      if (dto.notes !== undefined) {
        // A ledger row is only ever opened by a real assignment change,
        // so there is nowhere to record this note. Saying so is better
        // than a 200 that quietly discards what the caller wrote.
        throw new BadRequestException(
          expectedAssigneeId === null
            ? 'Asset is already unassigned'
            : 'Asset is already assigned to this user',
        );
      }
      return toAssetResponse(asset);
    }

    if (dto.assignedToId) {
      // Validation, not a race: an unavailable asset is rejected here so
      // the caller gets a 400 explaining why, rather than a 409 from the
      // CAS predicate below.
      if (!isAssignableStatus(expectedStatus)) {
        throw new BadRequestException(
          `An asset in status ${expectedStatus} cannot be assigned; move it back to stock first`,
        );
      }

      // Any active user may hold equipment — employees legitimately do —
      // so this deliberately does not restrict the target to staff roles.
      const target = await this.usersService.findById(dto.assignedToId);
      if (!target || !target.isActive) {
        throw new BadRequestException(
          'assignedToId must refer to an active user',
        );
      }
    }

    const now = new Date();

    await this.runTransaction(async (tx) => {
      // Conditional update gates the write on BOTH the assignee and the
      // status still being what we last read — closes the race where two
      // staff hand the same in-stock asset to different people at once,
      // and the one where a status change (e.g. -> InRepair) lands first.
      // Re-asserting assetVisibilityWhere keeps the write itself in
      // scope, not only the read that preceded it — ANDed as its own
      // clause, never spread, because `assetVisibilityWhere` itself
      // yields a `currentAssigneeId` key for an Employee: spreading it
      // last would overwrite the CAS pin above and quietly demote the
      // concurrency guard into an ownership check.
      const rotated = await tx.asset.updateMany({
        where: {
          AND: [
            this.assetVisibilityWhere(user),
            {
              id: asset.id,
              currentAssigneeId: expectedAssigneeId,
              status: expectedStatus,
            },
          ],
        },
        data: dto.assignedToId
          ? { currentAssigneeId: dto.assignedToId, status: AssetStatus.Assigned }
          : { currentAssigneeId: null, status: AssetStatus.InStock },
      });
      if (rotated.count !== 1) {
        throw new ConflictException(CONFLICT_MESSAGE);
      }

      // Close whatever the ledger still has open for this asset. Written
      // as updateMany (not a targeted update on the row we expect) so a
      // historically inconsistent asset with more than one open row is
      // repaired rather than left to accumulate — and so a return with no
      // open row is a harmless no-op instead of a P2025.
      await tx.assetAssignment.updateMany({
        where: { assetId: asset.id, returnedAt: null },
        data: { returnedAt: now },
      });

      if (dto.assignedToId) {
        await tx.assetAssignment.create({
          data: {
            assetId: asset.id,
            assignedToId: dto.assignedToId,
            assignedById: user.id,
            notes: dto.notes,
          },
        });
      }
    });

    this.logger.log(
      `Asset ${asset.id} assignment changed by user ${user.id}`,
    );

    return this.findOne(id, user);
  }

  /** The asset's assignment ledger — open and closed rows, newest first.
   * This IS the asset's history; there is no separate audit table. */
  async findAssignments(
    id: string,
    query: ListAssetAssignmentsQueryDto,
    user: AuthenticatedUser,
  ): Promise<AssetAssignmentListResponseDto> {
    this.assertStaff(user, 'Only staff can view asset assignment history');

    await this.getVisibleAssetOrThrow(id, user);

    const where: Prisma.AssetAssignmentWhereInput = { assetId: id };

    const [assignments, total] = await Promise.all([
      this.prisma.assetAssignment.findMany({
        where,
        include: assignmentInclude,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.assetAssignment.count({ where }),
    ]);

    return { data: assignments.map(toAssetAssignmentResponse), total };
  }

  /**
   * Ticket <-> asset links for one ticket.
   *
   * Ticket visibility is the caller's responsibility: TicketsService
   * resolves the ticket through its own visibility helper first, so a
   * ticket the caller cannot see never reaches this method. That ticket
   * check is the ONLY scoping this route relies on, and deliberately so —
   * every asset here is projected down to AssetSummaryResponseDto (id,
   * assetTag, name, status, assetType) for EVERY role. The list answers
   * "which assets is this ticket about"; the detail an Employee must not
   * see about somebody else's asset — serialNumber, staff notes, the
   * current holder — is never loaded here at all and stays behind
   * GET /assets/:id, which is row-scoped by `common/asset-visibility.ts`.
   *
   * Because that projection is uniform there is no per-caller decision
   * left to make, which is why this takes no `user` parameter.
   */
  async findForTicket(ticketId: string): Promise<TicketAssetResponseDto[]> {
    const links = await this.prisma.ticketAsset.findMany({
      // Soft-deleted assets drop out of the listing rather than appearing
      // as tombstones.
      where: { ticketId, asset: { deletedAt: null } },
      include: ticketAssetInclude,
      orderBy: [{ linkedAt: 'desc' }, { assetId: 'desc' }],
    });
    return links.map(toTicketAssetResponse);
  }

  /**
   * Links an asset to a ticket. Idempotent: linking an already-linked
   * asset returns the existing link untouched rather than failing on the
   * composite primary key. Ticket visibility is the caller's
   * responsibility (see findForTicket).
   */
  async linkToTicket(
    ticketId: string,
    assetId: string,
    user: AuthenticatedUser,
  ): Promise<TicketAssetResponseDto> {
    this.assertStaff(user, 'Only staff can link an asset to a ticket');

    // Link scoping is deliberately NOT assetVisibilityWhere: only staff
    // reach this path, and staff see every non-deleted asset.
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: { id: true },
    });
    if (!asset) {
      throw new BadRequestException('assetId does not refer to an existing asset');
    }

    const existing = await this.findTicketAssetLink(ticketId, assetId);
    if (existing) {
      return toTicketAssetResponse(existing);
    }

    try {
      const created = await this.prisma.ticketAsset.create({
        data: { ticketId, assetId, linkedById: user.id },
        include: ticketAssetInclude,
      });
      return toTicketAssetResponse(created);
    } catch (error) {
      // Lost the race against a concurrent link of the same pair: the
      // result the caller asked for exists, so return it rather than
      // surfacing a conflict for an operation that is defined as
      // idempotent.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const link = await this.findTicketAssetLink(ticketId, assetId);
        if (link) {
          return toTicketAssetResponse(link);
        }
        // The link vanished again between the failed insert and this
        // re-read (the competing writer rolled back, or unlinked). Falling
        // through to mapPrismaError would report "an asset with this asset
        // tag already exists" — the wrong resource entirely, since the
        // constraint that fired was the ticket_assets composite key.
        throw new ConflictException(
          'Could not link the asset to the ticket; retry',
        );
      }
      return this.mapPrismaError(error);
    }
  }

  /**
   * Removes a ticket <-> asset link. Idempotent: unlinking something that
   * is not linked succeeds silently. Ticket visibility is the caller's
   * responsibility (see findForTicket).
   */
  async unlinkFromTicket(
    ticketId: string,
    assetId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    this.assertStaff(user, 'Only staff can unlink an asset from a ticket');

    await this.prisma.ticketAsset.deleteMany({ where: { ticketId, assetId } });
  }

  private async findTicketAssetLink(
    ticketId: string,
    assetId: string,
  ): Promise<TicketAssetWithRelations | null> {
    return this.prisma.ticketAsset.findFirst({
      where: { ticketId, assetId },
      include: ticketAssetInclude,
    });
  }

  private searchWhere(term: string): Prisma.AssetWhereInput {
    // `contains` compiles to a Postgres ILIKE, where `%` and `_` are
    // wildcards and `\` is the default escape character. The term is a
    // bound parameter either way (so this is not an injection fix) — it is
    // a correctness one: without escaping, `q=%` matches every row and
    // `q=a_b` matches "axb".
    const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
    const contains = { contains: escaped, mode: Prisma.QueryMode.insensitive };
    return {
      OR: [
        { assetTag: contains },
        { name: contains },
        { serialNumber: contains },
      ],
    };
  }

  /**
   * PATCH /assets/:id may change status, but never assignment. Rejecting
   * both directions here is what keeps `status` and `currentAssigneeId`
   * from drifting apart: an asset can only become Assigned through the
   * assignment route, and an asset that is currently held cannot be moved
   * to another status behind the ledger's back.
   */
  private assertNonAssignmentStatusChange(
    asset: AssetWithRelations,
    newStatus: AssetStatus,
  ): void {
    if (newStatus === AssetStatus.Assigned) {
      throw new BadRequestException(
        'Assign an asset through PATCH /assets/:id/assignment, not by setting status',
      );
    }
    if (asset.currentAssigneeId !== null) {
      throw new BadRequestException(
        `Asset is currently assigned; return it through PATCH /assets/:id/assignment before changing its status to ${newStatus}`,
      );
    }
  }

  private assetVisibilityWhere(user: AuthenticatedUser): Prisma.AssetWhereInput {
    return buildAssetVisibilityWhere(user);
  }

  private assertStaff(user: AuthenticatedUser, message: string): void {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException(message);
    }
  }

  /** Out-of-scope and soft-deleted assets are indistinguishable from
   * nonexistent ones (404, never 403) — ADR-019's safe-not-found rule. */
  private async getVisibleAssetOrThrow(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssetWithRelations> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, ...this.assetVisibilityWhere(user) },
      include: assetInclude,
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  private async assertActiveAssetType(assetTypeId: string): Promise<void> {
    const assetType = await this.assetTypesService.findActiveById(assetTypeId);
    if (!assetType) {
      throw new BadRequestException(
        'assetTypeId does not refer to an active asset type',
      );
    }
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
      if (error.code === 'P2002') {
        throw new ConflictException('An asset with this asset tag already exists');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('Referenced record no longer exists');
      }
      // No P2025 branch: this service only ever issues create/updateMany/
      // deleteMany, none of which raise "record to update not found" — a
      // missing row surfaces as `count: 0` and is handled at the call site.
    }
    throw error as Error;
  }
}
