import { ApiProperty } from '@nestjs/swagger';
import { AnalyticsWindowDto } from './analytics-window.dto';

export class SlaClockAnalyticsDto {
  @ApiProperty({ description: 'Clocks that completed within their target.' })
  met!: number;

  @ApiProperty({ description: 'Clocks that completed after their target (persisted breach).' })
  breached!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'met / (met + breached) in 0..1, or null when no clock completed. null is not 0: an empty window has no rate.',
  })
  complianceRate!: number | null;

  @ApiProperty({
    description:
      'Live clocks (unresolved, not OnHold) already past their due date — derived, not yet persisted.',
  })
  inFlightBreached!: number;

  @ApiProperty({
    description:
      'Live clocks not yet breached whose remaining time is at or below the at-risk fraction of their own target. Paused clocks are never at risk.',
  })
  atRisk!: number;
}

/** `GET /api/v1/analytics/sla` — staff-only. Cohort: tickets created in the window that carry an SLA. */
export class SlaAnalyticsResponseDto {
  @ApiProperty({ type: AnalyticsWindowDto })
  window!: AnalyticsWindowDto;

  @ApiProperty({ description: 'Tickets created in the window that have an SLA row.' })
  ticketsWithSla!: number;

  @ApiProperty({ type: SlaClockAnalyticsDto })
  response!: SlaClockAnalyticsDto;

  @ApiProperty({ type: SlaClockAnalyticsDto })
  resolution!: SlaClockAnalyticsDto;
}
