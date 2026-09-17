import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus } from '@prisma/client';
import { AssetTypeResponseDto } from '../../asset-types/dto/asset-type-response.dto';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';

export class AssetResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Stable human-facing identifier, e.g. "LAPTOP-0001".' })
  assetTag!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AssetStatus })
  status!: AssetStatus;

  @ApiPropertyOptional({ nullable: true })
  serialNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  purchaseDate!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  warrantyExpiresAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: AssetTypeResponseDto })
  assetType!: AssetTypeResponseDto;

  @ApiPropertyOptional({ type: UserSummaryResponseDto, nullable: true })
  currentAssignee!: UserSummaryResponseDto | null;
}

export class AssetListResponseDto {
  @ApiProperty({ type: [AssetResponseDto] })
  data!: AssetResponseDto[];

  @ApiProperty()
  total!: number;
}
