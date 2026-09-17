import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

export class AssignAssetDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'User id to assign the asset to (any active user, not only staff), or null to return it to stock.',
  })
  @ValidateIf((dto: AssignAssetDto) => dto.assignedToId !== null)
  @IsUUID()
  assignedToId!: string | null;

  @ApiPropertyOptional({
    maxLength: 5000,
    description:
      'Recorded on the assignment ledger row this request opens. Ignored on a return, which closes the existing row rather than opening one.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  @NoControlCharacters()
  notes?: string;
}
