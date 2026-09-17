import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxDate,
  MaxLength,
  MinDate,
} from 'class-validator';
import {
  MAX_ACCEPTED_DATE,
  MIN_ACCEPTED_DATE,
  toIsoDate,
} from '../../common/transforms/iso-date.transform';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

/**
 * Every free-text cap here matches the corresponding schema column width
 * (assets.asset_tag VarChar(50), name VarChar(150), serial_number
 * VarChar(100)), so an oversized value is rejected by validation rather
 * than by the database. `notes` is unbounded TEXT in the schema and is
 * capped at the same 5000 the ticket comment body uses.
 *
 * Every text field also carries @NoControlCharacters, because Postgres
 * refuses a NUL byte in a text value and Prisma reports that refusal in
 * a shape no error mapper recognises — a 500 for what is plainly bad
 * input. Date fields use the ISO-only @Transform rather than
 * `@Type(() => Date)` for the equivalent reason.
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
  @NoControlCharacters()
  assetTag!: string;

  @ApiProperty({ maxLength: 150 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @NoControlCharacters()
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
  @NoControlCharacters()
  serialNumber?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Transform(toIsoDate)
  @IsDate()
  @MinDate(MIN_ACCEPTED_DATE)
  @MaxDate(MAX_ACCEPTED_DATE)
  purchaseDate?: Date;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @Transform(toIsoDate)
  @IsDate()
  @MinDate(MIN_ACCEPTED_DATE)
  @MaxDate(MAX_ACCEPTED_DATE)
  warrantyExpiresAt?: Date;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  @NoControlCharacters()
  notes?: string;
}
