import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';

/**
 * `assetTag` is intentionally not editable: it is the asset's stable
 * human-facing identity (and the unique key other records are reconciled
 * against). `currentAssigneeId` is not editable here either — status and
 * assignee are only ever changed together, through
 * PATCH /assets/:id/assignment, so the two can never drift apart.
 */
export class UpdateAssetDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assetTypeId?: string;

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

  @ApiPropertyOptional({
    enum: AssetStatus,
    description:
      'Non-assignment status transitions only. Assigned is rejected here, and any status change to an asset that currently has an assignee is rejected — return it first.',
  })
  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;
}
