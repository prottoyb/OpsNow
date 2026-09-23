import { ApiProperty } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';

/**
 * Read-only: `GET /api/v1/sla-policies` exposes the seeded policies as-is.
 * Policy CRUD is deliberately out of scope for now.
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
