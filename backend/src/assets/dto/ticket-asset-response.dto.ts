import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';
import { AssetSummaryResponseDto } from './asset-summary-response.dto';

/** A ticket <-> asset link, with a summary of the linked asset embedded.
 * Deliberately a summary and not the full AssetResponseDto — see
 * AssetSummaryResponseDto for why. */
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

  @ApiProperty({ type: AssetSummaryResponseDto })
  asset!: AssetSummaryResponseDto;
}
