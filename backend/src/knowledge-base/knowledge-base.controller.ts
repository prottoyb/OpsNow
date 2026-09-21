import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import { CreateArticleFeedbackDto } from './dto/create-article-feedback.dto';
import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import {
  KnowledgeArticleFeedbackListResponseDto,
  KnowledgeArticleFeedbackSummaryDto,
} from './dto/knowledge-article-feedback-response.dto';
import { KnowledgeArticleResponseDto } from './dto/knowledge-article-response.dto';
import { KnowledgeArticleListResponseDto } from './dto/knowledge-article-summary-response.dto';
import { ListArticleFeedbackQueryDto } from './dto/list-article-feedback-query.dto';
import { ListKnowledgeArticlesQueryDto } from './dto/list-knowledge-articles-query.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';
import { KnowledgeBaseService } from './knowledge-base.service';

/**
 * Read routes are open to any authenticated user but row-scoped by
 * KnowledgeBaseService (an Employee only ever sees Published articles).
 * Authoring routes are staff-only via @Roles, and the service re-checks
 * the role itself as defense in depth — plus the finer-grained authoring
 * rules that @Roles cannot express (a SupportAgent may edit only their
 * own articles, and may not change status at all).
 *
 * There is deliberately no DELETE: `status: Archived` is the retire path.
 * Every route is id-based; `slug` is returned for display and link
 * building but is never a lookup key, matching every other resource here.
 */
@ApiTags('kb-articles')
@Controller('kb-articles')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Roles(...STAFF_ROLES)
  @Post()
  async create(
    @Body() dto: CreateKnowledgeArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    return this.knowledgeBaseService.create(dto, user);
  }

  @Get()
  async findAll(
    @Query() query: ListKnowledgeArticlesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleListResponseDto> {
    return this.knowledgeBaseService.findAll(query, user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    return this.knowledgeBaseService.findOne(id, user);
  }

  /** Staff-only at the guard; WHICH staff may change what is decided in
   * the service (author-ownership for content, TeamLead/Administrator for
   * status). */
  @Roles(...STAFF_ROLES)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    return this.knowledgeBaseService.update(id, dto, user);
  }

  /** Open to any authenticated user who can SEE the article — rating the
   * guidance you were given is the point of the feature. Returns the
   * aggregate summary, never other readers' comments. */
  @Post(':id/feedback')
  async submitFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateArticleFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleFeedbackSummaryDto> {
    return this.knowledgeBaseService.submitFeedback(id, dto, user);
  }

  /** Staff-only: the rows carry free-text comments and the identity of
   * whoever wrote them. See KnowledgeArticleFeedbackResponseDto. */
  @Roles(...STAFF_ROLES)
  @Get(':id/feedback')
  async findFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListArticleFeedbackQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeArticleFeedbackListResponseDto> {
    return this.knowledgeBaseService.findFeedback(id, query, user);
  }
}
