import { ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeArticleStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

/**
 * `slug` is intentionally not editable: it is generated once from the
 * title at creation and then frozen, so any link that has ever pointed at
 * an article keeps working after an editorial retitle. `authorId`,
 * `viewCount` and `publishedAt` are not editable either — the first is
 * the article's provenance, and the last two are recorded by the server
 * as things happen.
 *
 * No field uses `@IsOptional()`, for the reason documented at length on
 * UpdateAssetDto: it treats an explicit `null` exactly like an omitted
 * key and skips every validator, so `{"title": null}` would validate
 * clean and reach Prisma as a null write to a NOT NULL column. Each field
 * guards with `@ValidateIf(... !== undefined)` instead.
 *
 * `categoryId` is the one genuinely nullable column here and accepts
 * `null` deliberately, as the way to move an article back out of any
 * category.
 */
export class UpdateKnowledgeArticleDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((dto: UpdateKnowledgeArticleDto) => dto.title !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @NoControlCharacters()
  title?: string;

  @ApiPropertyOptional({ maxLength: 50000 })
  @ValidateIf((dto: UpdateKnowledgeArticleDto) => dto.content !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  @NoControlCharacters()
  content?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Must refer to an ACTIVE category. Send null to remove the article from its category.',
  })
  @ValidateIf(
    (dto: UpdateKnowledgeArticleDto) =>
      dto.categoryId !== undefined && dto.categoryId !== null,
  )
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({
    enum: KnowledgeArticleStatus,
    description:
      'Publish / unpublish / archive. Restricted to TeamLead and Administrator: a SupportAgent sending this field is rejected with 403 even on an article they wrote themselves. Submitting the current status is an accepted no-op.',
  })
  @ValidateIf((dto: UpdateKnowledgeArticleDto) => dto.status !== undefined)
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;
}
