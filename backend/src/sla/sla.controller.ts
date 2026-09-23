import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import { SlaMetricsResponseDto } from './dto/sla-metrics-response.dto';
import { SlaPolicyResponseDto } from './dto/sla-policy-response.dto';
import { SlaService } from './sla.service';

/**
 * Both routes are staff-only (`@Roles` guard, plus SlaService's own
 * `assertStaff` as defense-in-depth — matches TicketsController's pattern
 * for its staff-only routes). Read-only: policy CRUD is deliberately out
 * of scope for now.
 */
@ApiTags('sla')
@Roles(...STAFF_ROLES)
@Controller()
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get('sla-policies')
  async findPolicies(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SlaPolicyResponseDto[]> {
    return this.slaService.findPolicies(user);
  }

  @Get('sla/metrics')
  async getMetrics(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SlaMetricsResponseDto> {
    return this.slaService.getMetrics(user);
  }
}
