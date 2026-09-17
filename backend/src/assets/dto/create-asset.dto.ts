import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';

/**
 * Every free-text cap here matches the corresponding schema column width
 * (assets.asset_tag VarChar(50), name VarChar(150), serial_number
 * VarChar(100)), so an oversized value is rejected by validation rather
 * than by the database. `notes` is unbounded TEXT in the schema and is
 * capped at the same 5000 the ticket comment body uses.
 *
 * `status` and `currentAssigneeId` are deliberately absent: a new asset
 * is always created InStock and unassigned, and assignment happens only
 * through PATCH /assets/:id/assignment.
 */
export class CreateAssetDto {
  @ApiProperty({ maxLength: 50 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  assetTag!: string;

  @ApiProperty({ maxLength: 150 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assetTypeId!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  purchaseDate?: Date;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  warrantyExpiresAt?: Date;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
