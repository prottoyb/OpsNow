import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';
import { KnowledgeArticleSummaryResponseDto } from './knowledge-article-summary-response.dto';

/** A ticket <-> knowledge-article link, with a summary of the linked
 * article embedded — never the full body, for the reasons on
 * KnowledgeArticleSummaryResponseDto. */
export class TicketKnowledgeArticleResponseDto {
  @ApiProperty()
  ticketId!: string;

  @ApiProperty()
  linkedAt!: Date;

  @ApiPropertyOptional({
    type: UserSummaryResponseDto,
    nullable: true,
    description: 'Null if the linking user has since been removed.',
  })
  linkedBy!: UserSummaryResponseDto | null;

  @ApiProperty({ type: KnowledgeArticleSummaryResponseDto })
  article!: KnowledgeArticleSummaryResponseDto;
}
