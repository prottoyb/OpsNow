import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssetStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxDate,
  MaxLength,
  MinDate,
  ValidateIf,
} from 'class-validator';
import {
  MAX_ACCEPTED_DATE,
  MIN_ACCEPTED_DATE,
  toIsoDate,
} from '../../common/transforms/iso-date.transform';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

/**
 * `assetTag` is intentionally not editable: it is the asset's stable
 * human-facing identity (and the unique key other records are reconciled
 * against). `currentAssigneeId` is not editable here either — status and
 * assignee are only ever changed together, through
 * PATCH /assets/:id/assignment, so the two can never drift apart.
 *
 * No field uses `@IsOptional()`, because it treats an explicit `null`
 * exactly like an omitted key and skips every validator: `{"name": null}`
 * would validate clean, reach Prisma as a null write to a NOT NULL
 * column, and come back as a 500. Each field instead guards with
 * `@ValidateIf(... !== undefined)`, so omission stays optional while an
 * explicit null is validated — and rejected on the non-nullable fields.
 *
 * The four genuinely nullable columns (serialNumber, notes, purchaseDate,
 * warrantyExpiresAt) accept `null` deliberately, as the way to CLEAR
 * them, and say so in their types and their OpenAPI schema.
 */
export class UpdateAssetDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @ValidateIf((dto: UpdateAssetDto) => dto.name !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @NoControlCharacters()
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((dto: UpdateAssetDto) => dto.assetTypeId !== undefined)
  @IsUUID()
  assetTypeId?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    nullable: true,
    description: 'Send null to clear the recorded serial number.',
  })
  @ValidateIf(
    (dto: UpdateAssetDto) =>
      dto.serialNumber !== undefined && dto.serialNumber !== null,
  )
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @NoControlCharacters()
  serialNumber?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Send null to clear the recorded purchase date.',
  })
  @ValidateIf(
    (dto: UpdateAssetDto) =>
      dto.purchaseDate !== undefined && dto.purchaseDate !== null,
  )
  @Transform(toIsoDate)
  @IsDate()
  @MinDate(MIN_ACCEPTED_DATE)
  @MaxDate(MAX_ACCEPTED_DATE)
  purchaseDate?: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Send null to clear the recorded warranty expiry.',
  })
  @ValidateIf(
    (dto: UpdateAssetDto) =>
      dto.warrantyExpiresAt !== undefined && dto.warrantyExpiresAt !== null,
  )
  @Transform(toIsoDate)
  @IsDate()
  @MinDate(MIN_ACCEPTED_DATE)
  @MaxDate(MAX_ACCEPTED_DATE)
  warrantyExpiresAt?: Date | null;

  @ApiPropertyOptional({
    maxLength: 5000,
    nullable: true,
    description: 'Send null to clear the notes.',
  })
  @ValidateIf(
    (dto: UpdateAssetDto) => dto.notes !== undefined && dto.notes !== null,
  )
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  @NoControlCharacters()
  notes?: string | null;

  @ApiPropertyOptional({
    enum: AssetStatus,
    description:
      'Non-assignment status transitions only. Assigned is rejected here, and any status change to an asset that currently has an assignee is rejected — return it first. OMIT this field unless the status is actually changing: it is validated whenever it is present at all, so a client that PATCHes a whole edit form back will get a 400 on every Assigned asset.',
  })
  @ValidateIf((dto: UpdateAssetDto) => dto.status !== undefined)
  @IsEnum(AssetStatus)
  status?: AssetStatus;
}
