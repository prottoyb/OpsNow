import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';

/**
 * One row of the asset's assignment ledger. The ledger IS the asset's
 * history: an open row (returnedAt === null) is the current holding, and
 * closed rows are past holdings.
 */
export class AssetAssignmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  assetId!: string;

  @ApiProperty()
  assignedAt!: Date;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null while the assignment is still open.',
  })
  returnedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ type: UserSummaryResponseDto })
  assignedTo!: UserSummaryResponseDto;

  @ApiProperty({ type: UserSummaryResponseDto })
  assignedBy!: UserSummaryResponseDto;
}

export class AssetAssignmentListResponseDto {
  @ApiProperty({ type: [AssetAssignmentResponseDto] })
  data!: AssetAssignmentResponseDto[];

  @ApiProperty()
  total!: number;
}
