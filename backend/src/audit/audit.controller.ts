import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { AUDIT_READ_ROLES } from './audit.constants';
import { AuditService } from './audit.service';
import { AuditLogListResponseDto } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Administrator-only — deliberately narrower than the staff-only gate used
 * elsewhere: the log holds every user's activity, authentication included,
 * and a TeamLead has no operational need for it. Backed by an assertion in
 * AuditService. Read-only by design: there is no update or delete route,
 * because the log is append-only.
 */
@ApiTags('audit-logs')
@Roles(...AUDIT_READ_ROLES)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(
    @Query() query: ListAuditLogsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuditLogListResponseDto> {
    return this.auditService.findAll(query, user);
  }
}
