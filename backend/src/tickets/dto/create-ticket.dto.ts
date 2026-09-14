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

export class CreateTicketDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @ApiProperty({ maxLength: 10000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
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
