import { ApiProperty } from '@nestjs/swagger';
import { CommentVisibility } from '@prisma/client';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';

export class TicketCommentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ enum: CommentVisibility })
  visibility!: CommentVisibility;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: UserSummaryResponseDto })
  author!: UserSummaryResponseDto;
}

export class TicketCommentListResponseDto {
  @ApiProperty({ type: [TicketCommentResponseDto] })
  data!: TicketCommentResponseDto[];

  @ApiProperty()
  total!: number;
}
