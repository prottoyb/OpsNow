import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

export class CreateTicketDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @NoControlCharacters()
  subject!: string;

  @ApiProperty({ maxLength: 10000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  @NoControlCharacters()
  description!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: TicketPriority, default: TicketPriority.Medium })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
