import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommentVisibility } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

export class CreateTicketCommentDto {
  @ApiProperty({ maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @NoControlCharacters()
  body!: string;

  @ApiPropertyOptional({
    enum: CommentVisibility,
    default: CommentVisibility.Public,
  })
  @IsOptional()
  @IsEnum(CommentVisibility)
  visibility?: CommentVisibility;
}
