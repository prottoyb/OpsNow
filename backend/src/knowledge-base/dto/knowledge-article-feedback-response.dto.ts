import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';

/** The caller's OWN vote, echoed back so a client can render the toggle
 * in its current state. Always scoped to the requesting user. */
export class MyArticleFeedbackDto {
  @ApiProperty()
  isHelpful!: boolean;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

/**
 * What EVERY role may know about an article's feedback: the two aggregate
 * counts, plus the caller's own vote.
 *
 * The free-text comments, and the identity of who wrote them, are
 * deliberately not here — see KnowledgeArticleFeedbackResponseDto.
 */
export class KnowledgeArticleFeedbackSummaryDto {
  @ApiProperty()
  helpfulCount!: number;

  @ApiProperty()
  notHelpfulCount!: number;

  @ApiPropertyOptional({
    type: MyArticleFeedbackDto,
    nullable: true,
    description: "The requesting user's own vote, or null if they haven't voted.",
  })
  myFeedback!: MyArticleFeedbackDto | null;
}

/**
 * One row of the staff-only feedback log.
 *
 * This is the shape an Employee must never receive, and the reason
 * GET /kb-articles/:id/feedback is @Roles(...STAFF_ROLES) with a second
 * check in the service (.claude/rules/security.md, Sensitive Data). A
 * feedback comment is unsolicited free text that a colleague wrote about
 * somebody's work while believing only the support team would read it —
 * "this is wrong, Ade's old process was better" is entirely normal
 * content. Pairing that text with its author's identity and exposing it
 * to every reader would turn an internal quality signal into a public
 * comment thread nobody consented to.
 *
 * Employees therefore see aggregate counts plus their own vote
 * (KnowledgeArticleFeedbackSummaryDto, embedded in the article detail)
 * and nothing else.
 */
export class KnowledgeArticleFeedbackResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  isHelpful!: boolean;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: UserSummaryResponseDto })
  user!: UserSummaryResponseDto;
}

export class KnowledgeArticleFeedbackListResponseDto {
  @ApiProperty({ type: [KnowledgeArticleFeedbackResponseDto] })
  data!: KnowledgeArticleFeedbackResponseDto[];

  @ApiProperty()
  total!: number;
}
