import { ApiProperty } from '@nestjs/swagger';

/**
 * `GET /api/v1/sla/metrics` — staff-only. Every count is a typed Prisma
 * `count()` query scoped through the same `ticketVisibilityWhere` every
 * other ticket query uses (ADR-019/020). At-risk is deliberately NOT
 * included as an aggregate here — it is a per-row percentage of a per-row
 * target, not a fixed cutoff a `where` clause can express; it remains
 * available per-ticket via `sla.responseState`/`sla.resolutionState` and is
 * deferred as an aggregate to Phase 10.
 */
export class SlaMetricsResponseDto {
  @ApiProperty({
    description: 'Open (unresolved, not soft-deleted) tickets that have an SLA attached.',
  })
  openWithSla!: number;

  @ApiProperty({
    description:
      'Unresolved, not-OnHold tickets whose resolution due date has already passed (derived, not yet persisted).',
  })
  resolutionBreachedInFlight!: number;

  @ApiProperty({
    description: "Tickets whose resolution clock completed with a persisted breach.",
  })
  resolutionBreachedCompleted!: number;

  @ApiProperty({ description: 'Tickets with a qualifying first response recorded on time.' })
  respondedOnTime!: number;

  @ApiProperty({ description: "Tickets with a qualifying first response recorded after its due date." })
  respondedLate!: number;

  @ApiProperty({
    description:
      'Unresolved, not-OnHold tickets with no response yet whose response due date has already passed.',
  })
  responseOverdueOutstanding!: number;

  @ApiProperty({
    description: 'Tickets that resolved without ever receiving a qualifying first response.',
  })
  neverResponded!: number;
}
