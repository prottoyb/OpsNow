import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import { ANALYTICS_AGENT_ROLES } from './analytics.constants';
import { AnalyticsService } from './analytics.service';
import { AgentAnalyticsResponseDto } from './dto/agent-analytics-response.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { CategoryAnalyticsResponseDto } from './dto/category-analytics-response.dto';
import { SlaAnalyticsResponseDto } from './dto/sla-analytics-response.dto';
import { TicketAnalyticsResponseDto } from './dto/ticket-analytics-response.dto';

/**
 * Staff-only, except `agents`, which is TeamLead/Administrator only (it ranks
 * named colleagues). Each route's `@Roles` guard is backed by an assertion in
 * AnalyticsService, matching SlaController's defence in depth.
 */
@ApiTags('analytics')
@Roles(...STAFF_ROLES)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('tickets')
  async getTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ): Promise<TicketAnalyticsResponseDto> {
    return this.analyticsService.getTicketAnalytics(user, query);
  }

  @Get('sla')
  async getSla(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ): Promise<SlaAnalyticsResponseDto> {
    return this.analyticsService.getSlaAnalytics(user, query);
  }

  @Get('categories')
  async getCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ): Promise<CategoryAnalyticsResponseDto> {
    return this.analyticsService.getCategoryAnalytics(user, query);
  }

  @Roles(...ANALYTICS_AGENT_ROLES)
  @Get('agents')
  async getAgents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AgentAnalyticsResponseDto> {
    return this.analyticsService.getAgentAnalytics(user, query);
  }
}
