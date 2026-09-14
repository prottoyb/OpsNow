import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommentVisibility } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';

export class CreateTicketCommentDto {
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({
    enum: CommentVisibility,
    default: CommentVisibility.Public,
  })
  @IsOptional()
  @IsEnum(CommentVisibility)
  visibility?: CommentVisibility;
}
