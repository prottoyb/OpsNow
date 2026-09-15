import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SlaResolutionState, SlaResponseState } from '../sla.constants';

/**
 * Embedded on TicketResponseDto (`sla`, nullable) — never a standalone
 * per-ticket route, so ADR-019's row-ownership scoping never has to be
 * separately remembered for it. Identical shape for every role (D5,
 * ADR-020): no field is hidden based on Employee vs staff.
 *
 * Deliberately does NOT join/expose the SLA policy (name, id) — the
 * targets below are a snapshot taken at attach time specifically so a
 * later policy edit can never retroactively change an existing ticket's
 * commitment; a live join would silently reintroduce that mutability.
 */
export class TicketSlaResponseDto {
  @ApiProperty()
  responseTargetMinutes!: number;

  @ApiProperty()
  resolutionTargetMinutes!: number;

  @ApiProperty()
  responseDueAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  responseAt!: Date | null;

  @ApiProperty({ enum: SlaResponseState })
  responseState!: SlaResponseState;

  @ApiProperty({ description: 'Clamped at 0. Frozen at the pause-start value while isPaused is true.' })
  responseMinutesRemaining!: number;

  @ApiProperty()
  resolutionDueAt!: Date;

  @ApiProperty({ enum: SlaResolutionState })
  resolutionState!: SlaResolutionState;

  @ApiProperty({ description: 'Clamped at 0. Frozen at the pause-start value while isPaused is true.' })
  resolutionMinutesRemaining!: number;

  @ApiProperty({ description: 'True only while the ticket status is OnHold.' })
  isPaused!: boolean;

  @ApiProperty({ description: 'Display-only cumulative pause time; never an input to a breach/remaining calculation.' })
  totalPausedMinutes!: number;
}
