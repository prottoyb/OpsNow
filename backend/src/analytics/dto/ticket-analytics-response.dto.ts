import { ApiProperty } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { AnalyticsWindowDto } from './analytics-window.dto';

export class ResolutionMetricsDto {
  @ApiProperty({ description: 'Tickets whose resolution timestamp falls inside the window.' })
  resolvedCount!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Mean wall-clock minutes from creation to resolution over the tickets resolved in the window; null when none were.',
  })
  meanMinutes!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Median (percentile_cont 0.5) of the same durations; null when none were resolved.',
  })
  medianMinutes!: number | null;
}

/**
 * `GET /api/v1/analytics/tickets` — staff-only. Every figure is scoped by the
 * caller's ticket visibility AND the request filters.
 */
export class TicketAnalyticsResponseDto {
  @ApiProperty({ type: AnalyticsWindowDto })
  window!: AnalyticsWindowDto;

  @ApiProperty({ description: 'All matching tickets, regardless of the window.' })
  total!: number;

  @ApiProperty({ description: 'Tickets created inside the window.' })
  opened!: number;

  @ApiProperty({ description: 'Tickets resolved inside the window (whenever they were created).' })
  resolved!: number;

  @ApiProperty({
    description:
      'Snapshot at request time, independent of the window: matching tickets that are New, Open, InProgress or OnHold.',
  })
  backlog!: number;

  @ApiProperty({
    description: 'Current status of the tickets created in the window. Every status is present.',
    example: { New: 0, Open: 0, InProgress: 0, OnHold: 0, Resolved: 0, Closed: 0 },
  })
  byStatus!: Record<TicketStatus, number>;

  @ApiProperty({
    description: 'Priority of the tickets created in the window. Every priority is present.',
    example: { Low: 0, Medium: 0, High: 0, Critical: 0 },
  })
  byPriority!: Record<TicketPriority, number>;

  @ApiProperty({ type: ResolutionMetricsDto })
  resolution!: ResolutionMetricsDto;
}
