import { ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeArticleStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

/**
 * `status` and `authorId` are documented as staff-oriented filters, but
 * they are NOT role-gated at the DTO or the guard.
 *
 * That is deliberate and is the safer construction. KnowledgeBaseService
 * ANDs the caller's visibility clause in as its own top-level clause
 * (exactly as AssetsService.findAll does), so a filter can only ever
 * NARROW a result set, never widen it: an Employee asking for
 * `status=Draft` gets an empty page, because "Published only" AND "Draft"
 * matches nothing. Rejecting the filter with a 403 instead would be a
 * second, independent place where the role rule is written down — and a
 * place that could drift out of step with the visibility clause that is
 * actually doing the enforcement.
 */
export class ListKnowledgeArticlesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    maxLength: 200,
    description:
      'Full-text search over title and content, using Postgres websearch syntax ("quoted phrase", -excluded, or). Arbitrary text is always accepted.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @NoControlCharacters()
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: KnowledgeArticleStatus,
    description:
      'Narrows the result set only. An Employee can see Published articles only, so any other value yields an empty page rather than an error.',
  })
  @IsOptional()
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter by author — the "my drafts" view for staff.',
  })
  @IsOptional()
  @IsUUID()
  authorId?: string;
}
