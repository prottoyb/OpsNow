import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';

export class TicketHistoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fieldName!: string;

  @ApiPropertyOptional({ nullable: true })
  oldValue!: string | null;

  @ApiPropertyOptional({ nullable: true })
  newValue!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: UserSummaryResponseDto, nullable: true })
  actor!: UserSummaryResponseDto | null;
}

export class TicketHistoryListResponseDto {
  @ApiProperty({ type: [TicketHistoryResponseDto] })
  data!: TicketHistoryResponseDto[];

  @ApiProperty()
  total!: number;
}
