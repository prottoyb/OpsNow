import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeArticleStatus } from '@prisma/client';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';
import { KnowledgeBaseCategoryResponseDto } from '../../knowledge-base-categories/dto/knowledge-base-category-response.dto';

/**
 * The shape an article takes in a LIST, and wherever it is embedded in
 * something else (today, a ticket <-> article link).
 *
 * It carries `excerpt` instead of `content`, and that boundary is the
 * point. A knowledge article body is capped at 50,000 characters, so a
 * full page of 100 list rows could otherwise be a 5MB response for a
 * client that is going to render one line per row. Beyond size, it is the
 * "don't ship more than the client needs" rule from
 * .claude/rules/security.md: the body is the thing readers request
 * deliberately, one at a time, through GET /kb-articles/:id — which also
 * happens to be the only place the view counter can be attributed to an
 * actual read.
 *
 * `helpfulCount`/`notHelpfulCount` are here because they are aggregate
 * and cheap to batch for a whole page. The caller's own vote is NOT: it
 * would mean a per-row per-user lookup, and it is only useful on the
 * detail view where a reader can actually change it.
 */
export class KnowledgeArticleSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({
    description:
      'Stable URL-safe identifier derived from the title at creation. Never changes, and is NOT a lookup key — every route in this API is id-based.',
  })
  slug!: string;

  @ApiProperty({ enum: KnowledgeArticleStatus })
  status!: KnowledgeArticleStatus;

  @ApiProperty({
    description: 'Single-line plain-text preview of the article body.',
  })
  excerpt!: string;

  @ApiPropertyOptional({
    type: KnowledgeBaseCategoryResponseDto,
    nullable: true,
  })
  category!: KnowledgeBaseCategoryResponseDto | null;

  @ApiProperty({ type: UserSummaryResponseDto })
  author!: UserSummaryResponseDto;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Instant of the most recent publication; survives a later unpublish or archive.',
  })
  publishedAt!: Date | null;

  @ApiProperty()
  viewCount!: number;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty()
  helpfulCount!: number;

  @ApiProperty()
  notHelpfulCount!: number;
}

export class KnowledgeArticleListResponseDto {
  @ApiProperty({ type: [KnowledgeArticleSummaryResponseDto] })
  data!: KnowledgeArticleSummaryResponseDto[];

  @ApiProperty()
  total!: number;
}
