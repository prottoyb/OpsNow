import { ApiProperty } from '@nestjs/swagger';
import { AnalyticsWindowDto } from './analytics-window.dto';

export class CategoryStatDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'null groups uncategorised tickets.' })
  categoryId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryName!: string | null;

  @ApiProperty({ description: 'Tickets created in the window.' })
  volume!: number;

  @ApiProperty({ description: 'Of those, tickets that have been resolved.' })
  resolved!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Mean minutes from creation to resolution over the resolved tickets; null when none.',
  })
  avgResolutionMinutes!: number | null;

  @ApiProperty({
    description:
      'Tickets with at least one breached clock: a completed clock that breached, or a live clock already past due.',
  })
  slaBreaches!: number;
}

/** `GET /api/v1/analytics/categories` — staff-only. Ordered by volume, capped. */
export class CategoryAnalyticsResponseDto {
  @ApiProperty({ type: AnalyticsWindowDto })
  window!: AnalyticsWindowDto;

  @ApiProperty({ type: [CategoryStatDto] })
  categories!: CategoryStatDto[];

  @ApiProperty({ description: 'True when more categories matched than the cap allows; the smallest were dropped.' })
  truncated!: boolean;
}
