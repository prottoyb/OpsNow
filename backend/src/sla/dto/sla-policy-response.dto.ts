import { ApiProperty } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';

/**
 * Read-only: `GET /api/v1/sla-policies` exposes the seeded policies as-is.
 * There is no policy CRUD in Phase 7 (see TASKS.md).
 */
export class SlaPolicyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: TicketPriority })
  priority!: TicketPriority;

  @ApiProperty()
  responseTimeMinutes!: number;

  @ApiProperty()
  resolutionTimeMinutes!: number;

  @ApiProperty()
  isActive!: boolean;
}
