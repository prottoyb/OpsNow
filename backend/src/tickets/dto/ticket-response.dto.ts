import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';
import { TicketSlaResponseDto } from '../../sla/dto/ticket-sla-response.dto';
import { TicketCategoryResponseDto } from '../../ticket-categories/dto/ticket-category-response.dto';

export class TicketResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Human-facing ticket number, e.g. "#1042".' })
  ticketNumber!: number;

  @ApiProperty()
  subject!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: TicketStatus })
  status!: TicketStatus;

  @ApiProperty({ enum: TicketPriority })
  priority!: TicketPriority;

  @ApiProperty()
  reopenedCount!: number;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  closedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: UserSummaryResponseDto })
  requester!: UserSummaryResponseDto;

  @ApiPropertyOptional({ type: UserSummaryResponseDto, nullable: true })
  assignee!: UserSummaryResponseDto | null;

  @ApiPropertyOptional({ type: TicketCategoryResponseDto, nullable: true })
  category!: TicketCategoryResponseDto | null;

  @ApiPropertyOptional({
    type: TicketSlaResponseDto,
    nullable: true,
    description: 'Null only when no SLA policy was active for this priority at creation time.',
  })
  sla!: TicketSlaResponseDto | null;
}

export class TicketListResponseDto {
  @ApiProperty({ type: [TicketResponseDto] })
  data!: TicketResponseDto[];

  @ApiProperty()
  total!: number;
}
