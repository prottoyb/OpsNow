import { ApiProperty } from '@nestjs/swagger';
import { AnalyticsWindowDto } from './analytics-window.dto';

export class AgentStatDto {
  @ApiProperty({ format: 'uuid' })
  agentId!: string;

  @ApiProperty()
  agentName!: string;

  @ApiProperty({ description: 'Tickets created in the window that are assigned to this agent.' })
  assigned!: number;

  @ApiProperty({ description: 'Of those, tickets that have been resolved.' })
  resolved!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Mean minutes from creation to resolution over the resolved tickets; null when none.',
  })
  avgResolutionMinutes!: number | null;

  @ApiProperty({ description: 'Resolved tickets whose resolution clock was met.' })
  resolutionMet!: number;

  @ApiProperty({ description: 'Resolved tickets whose resolution clock breached.' })
  resolutionBreached!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'resolutionMet / (resolutionMet + resolutionBreached) in 0..1; null when nothing was resolved.',
  })
  slaComplianceRate!: number | null;
}

/**
 * `GET /api/v1/analytics/agents` — TeamLead and Administrator only, because
 * it ranks named colleagues. Ordered by assigned volume, capped.
 */
export class AgentAnalyticsResponseDto {
  @ApiProperty({ type: AnalyticsWindowDto })
  window!: AnalyticsWindowDto;

  @ApiProperty({ type: [AgentStatDto] })
  agents!: AgentStatDto[];

  @ApiProperty({ description: 'True when more agents matched than the cap allows; the smallest were dropped.' })
  truncated!: boolean;
}
