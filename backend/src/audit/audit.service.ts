import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { toUserSummary } from '../users/users.service';
import { AUDIT_READ_ROLES } from './audit.constants';
import { AuditEvent } from './audit.events';
import { buildAuditWhere } from './audit.filters';
import {
  sanitizeIp,
  sanitizeMetadata,
  sanitizeUserAgent,
} from './audit.sanitize';
import {
  AuditLogListResponseDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { PrismaService } from '../prisma/prisma.service';

const auditInclude = { actor: true } as const;

type AuditLogWithActor = Prisma.AuditLogGetPayload<{
  include: typeof auditInclude;
}>;

function toAuditLogResponse(row: AuditLogWithActor): AuditLogResponseDto {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    action: row.action,
    outcome: typeof metadata.outcome === 'string' ? metadata.outcome : null,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    actor: row.actor ? toUserSummary(row.actor) : null,
  };
}

/**
 * Append-only audit log: this service exposes `record` and `findAll` and
 * nothing that updates or deletes.
 *
 * WRITE SEMANTICS — best-effort, AFTER the primary operation, outside its
 * transaction, and awaited (so the row exists by the time the API responds,
 * which keeps tests deterministic) but never allowed to throw. See `record`.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist one audit event. NEVER rejects.
   *
   * Why not inside the operation's transaction: an audit-store outage would
   * then turn a valid login or ticket update into a 500 and roll it back —
   * the audit trail must not be able to take the product down. The price is
   * that an event can be lost if (a) this insert fails, or (b) the process
   * dies between the primary commit and this write. Both are logged/acceptable
   * at this project's scale (ADR-017); an outbox would close (b) and is
   * deliberately not built.
   *
   * A failure is logged with the action name and the error CLASS/CODE only —
   * never the error message, because Prisma messages embed the failed query's
   * arguments, i.e. the payload.
   */
  async record(event: AuditEvent): Promise<void> {
    try {
      const { metadata, droppedKeys } = sanitizeMetadata({
        ...event.metadata,
        outcome: event.outcome,
      });
      if (droppedKeys.length > 0) {
        // Key NAMES only. Reaching this means a builder passed a key that is
        // not on the allow-list: a programming error worth surfacing.
        this.logger.warn(
          `Audit event ${event.action} had non-allow-listed metadata keys dropped: ${droppedKeys.join(', ')}`,
        );
      }

      await this.prisma.auditLog.create({
        data: {
          actorId: event.actorId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          metadata: metadata,
          ipAddress: sanitizeIp(event.request.ipAddress),
          userAgent: sanitizeUserAgent(event.request.userAgent),
        },
      });
    } catch (error) {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? ` (${error.code})`
          : '';
      const name = error instanceof Error ? error.constructor.name : 'unknown';
      this.logger.error(
        `Failed to write audit event ${event.action}: ${name}${code}`,
      );
    }
  }

  async findAll(
    query: ListAuditLogsQueryDto,
    user: AuthenticatedUser,
  ): Promise<AuditLogListResponseDto> {
    // Defense in depth beyond the controller's @Roles guard.
    this.assertAdministrator(user);

    const where = buildAuditWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: auditInclude,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      // `count` returns a JS number, not a BigInt, so `total` is safe for
      // JSON.stringify; no $queryRaw count(*) is used here.
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: rows.map(toAuditLogResponse), total };
  }

  private assertAdministrator(user: AuthenticatedUser): void {
    if (!AUDIT_READ_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only administrators can read the audit log');
    }
  }
}
