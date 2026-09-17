import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkTicketAssetDto {
  @ApiProperty({ format: 'uuid', description: 'Asset to link to this ticket.' })
  @IsUUID()
  assetId!: string;
}
