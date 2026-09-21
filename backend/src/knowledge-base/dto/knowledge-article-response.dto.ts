import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeArticleStatus } from '@prisma/client';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';
import { KnowledgeBaseCategoryResponseDto } from '../../knowledge-base-categories/dto/knowledge-base-category-response.dto';
import { KnowledgeArticleFeedbackSummaryDto } from './knowledge-article-feedback-response.dto';

/** The full article, as returned by GET /kb-articles/:id (and echoed by
 * create/update). This is the only projection that carries `content`. */
export class KnowledgeArticleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({
    description:
      'Stable URL-safe identifier derived from the title at creation. Never changes, and is NOT a lookup key — every route in this API is id-based.',
  })
  slug!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: KnowledgeArticleStatus })
  status!: KnowledgeArticleStatus;

  @ApiPropertyOptional({
    type: KnowledgeBaseCategoryResponseDto,
    nullable: true,
  })
  category!: KnowledgeBaseCategoryResponseDto | null;

  @ApiProperty({ type: UserSummaryResponseDto })
  author!: UserSummaryResponseDto;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Instant of the most recent publication. Deliberately NOT cleared by an unpublish or an archive: it records when this article was last authoritative.',
  })
  publishedAt!: Date | null;

  @ApiProperty({
    description:
      'Includes the read that returned this response, when the article is Published. Staff previewing a Draft or an Archived article do not move the counter.',
  })
  viewCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: KnowledgeArticleFeedbackSummaryDto })
  feedback!: KnowledgeArticleFeedbackSummaryDto;
}
