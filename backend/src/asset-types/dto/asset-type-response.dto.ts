import { ApiProperty } from '@nestjs/swagger';

export class AssetTypeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;
}
