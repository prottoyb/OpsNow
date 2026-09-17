import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';
import { AssetResponseDto } from './asset-response.dto';

/** A ticket <-> asset link, with the linked asset embedded. */
export class TicketAssetResponseDto {
  @ApiProperty()
  ticketId!: string;

  @ApiProperty()
  linkedAt!: Date;

  @ApiPropertyOptional({
    type: UserSummaryResponseDto,
    nullable: true,
    description: 'Null if the linking user has since been removed.',
  })
  linkedBy!: UserSummaryResponseDto | null;

  @ApiProperty({ type: AssetResponseDto })
  asset!: AssetResponseDto;
}
