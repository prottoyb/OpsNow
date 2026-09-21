import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

/**
 * `title`'s cap matches the schema column (VarChar(200)), so an oversized
 * value is a 400 from validation rather than a driver error. `content` is
 * unbounded TEXT in the schema and is capped here at 50,000 characters —
 * generous for a long runbook, but a hard ceiling so an unbounded body
 * can never be written, indexed into the article's tsvector, or shipped
 * back out.
 *
 * Both fields carry @NoControlCharacters, which permits tab, LF and CR
 * (an article body is genuinely multi-line prose, exactly like a ticket
 * description) while rejecting NUL and the other C0 characters Postgres
 * refuses outright — those would otherwise surface as an unmapped 500.
 *
 * `status`, `authorId`, `slug`, `publishedAt` and `viewCount` are
 * deliberately ABSENT. An article is always born Draft, authored by the
 * caller, with a server-derived slug and no publication instant; with
 * `forbidNonWhitelisted: true` globally, a client that sends any of them
 * gets a 400 instead of silently having it ignored.
 */
export class CreateKnowledgeArticleDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @NoControlCharacters()
  title!: string;

  @ApiProperty({ maxLength: 50000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  @NoControlCharacters()
  content!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Must refer to an ACTIVE knowledge base category.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
