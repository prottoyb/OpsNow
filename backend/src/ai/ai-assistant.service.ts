import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommentVisibility, KnowledgeArticleStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { knowledgeArticleVisibilityWhere } from '../common/knowledge-article-visibility';
import { ListKnowledgeArticlesQueryDto } from '../knowledge-base/dto/list-knowledge-articles-query.dto';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { ticketVisibilityWhere } from '../common/ticket-visibility';
import { isStaffRole } from '../tickets/tickets.constants';
import { ConcurrencyLimiter } from './ai.concurrency';
import { MAX_PROMPT_ARTICLES, MAX_PROMPT_CATEGORIES } from './ai.constants';
import { AiUnavailableException } from './ai.errors';
import {
  validateDraftOutput,
  validateSummaryOutput,
  validateTriageOutput,
} from './ai.output';
import {
  buildDraftResponsePrompt,
  buildResolutionSummaryPrompt,
  buildTriagePrompt,
  PromptArticle,
  PromptCategory,
  PromptTicket,
} from './ai.prompts';
import {
  AI_PROVIDER,
  AiFailureReason,
  AiPrompt,
  AiProvider,
  AiProviderError,
  AiTask,
} from './ai.types';
import {
  AiArticleReferenceDto,
  AiDraftResponseDto,
  AiResolutionSummaryResponseDto,
  AiStatusResponseDto,
  AiTriageResponseDto,
} from './dto/ai-response.dto';

const TICKET_NOT_FOUND = 'Ticket not found';

/** Words of at least this length feed the article search. */
const MIN_SEARCH_WORD_LENGTH = 3;
const MAX_SEARCH_WORDS = 8;

/**
 * Read-only side car (ADR-023 Decision 1): it holds Prisma for READS and never
 * imports TicketsService, so an AI failure cannot fail a ticket write. Nothing
 * it produces is persisted or applied (Decisions 5 and 11).
 *
 * Nothing about a prompt, a completion or a key is ever logged (Decision 9):
 * log lines carry task, mode, outcome, latency, user id, ticket id, model id
 * and token counts only.
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBase: KnowledgeBaseService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly limiter: ConcurrencyLimiter,
  ) {}

  status(user: AuthenticatedUser): AiStatusResponseDto {
    // `enabled` folds the role check in, so a UI needs no role logic of its
    // own and an Employee always sees false.
    if (!isStaffRole(user.role)) {
      return { enabled: false, mode: 'disabled' };
    }
    return { enabled: this.provider.mode !== 'disabled', mode: this.provider.mode };
  }

  async triage(ticketId: string, user: AuthenticatedUser): Promise<AiTriageResponseDto> {
    const ticket = await this.loadTicket(ticketId, user, 'triage');

    const categories = await this.activeCategories();
    const articles = await this.candidateArticles(ticket, user, false);
    const prompt = buildTriagePrompt({ ticket: toPromptTicket(ticket), categories, articles });

    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const validated = await this.callModel(prompt, user, ticket.id, (text) =>
      validateTriageOutput(
        text,
        new Set(categoryNames.keys()),
        new Set(articles.map((a) => a.id)),
      ),
    );

    // Re-read under the caller's visibility so a change between assembly and
    // response is honoured; titles come from the row, not the model.
    const relatedArticles = await this.rereadArticles(validated.articleIds, user, false);

    return {
      suggestedCategory:
        validated.categoryId === null
          ? null
          : {
              id: validated.categoryId,
              name: categoryNames.get(validated.categoryId) as string,
            },
      suggestedPriority: validated.priority,
      rationale: validated.rationale,
      relatedArticles,
      mode: this.provider.mode,
    };
  }

  async draftResponse(ticketId: string, user: AuthenticatedUser): Promise<AiDraftResponseDto> {
    const ticket = await this.loadTicket(ticketId, user, 'draft_response');

    // Published ONLY, whatever the caller's role (ADR-023 Decision 7): the
    // draft is written to be sent to the requester.
    const articles = await this.candidateArticles(ticket, user, true);
    const publicComments = await this.publicComments(ticket.id, 10);
    const prompt = buildDraftResponsePrompt({
      ticket: toPromptTicket(ticket),
      articles,
      publicComments,
    });

    const validated = await this.callModel(prompt, user, ticket.id, (text) =>
      validateDraftOutput(text, new Set(articles.map((a) => a.id))),
    );
    const referencedArticles = await this.rereadArticles(validated.articleIds, user, true);

    return { draft: validated.draft, referencedArticles, mode: this.provider.mode };
  }

  async resolutionSummary(
    ticketId: string,
    user: AuthenticatedUser,
  ): Promise<AiResolutionSummaryResponseDto> {
    const ticket = await this.loadTicket(ticketId, user, 'resolution_summary');
    const publicComments = await this.publicComments(ticket.id, 20);
    const prompt = buildResolutionSummaryPrompt({
      ticket: toPromptTicket(ticket),
      publicComments,
    });

    const validated = await this.callModel(prompt, user, ticket.id, validateSummaryOutput);
    return { summary: validated.summary, mode: this.provider.mode };
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  /**
   * Staff check (defence in depth behind the controller's @Roles), then the
   * ticket under `ticketVisibilityWhere` — out of scope is a 404, never a 403
   * (ADR-019) — then the disabled short-circuit, so an unconfigured install
   * does no context assembly at all.
   */
  private async loadTicket(ticketId: string, user: AuthenticatedUser, task: AiTask) {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException('Only staff can use the AI assistant');
    }

    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id: ticketId }, ticketVisibilityWhere(user)] },
      select: { id: true, subject: true, description: true, priority: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException(TICKET_NOT_FOUND);
    }

    if (this.provider.mode === 'disabled') {
      this.logFailure(task, user.id, ticket.id, 'disabled', 0);
      throw new AiUnavailableException('disabled');
    }
    return ticket;
  }

  /**
   * The only place the provider is invoked. Bounded by the concurrency cap
   * (the provider enforces its own timeout), validated by `validate`, and
   * every failure — including an unexpected exception — becomes one
   * AiUnavailableException with a reason. Never retried.
   */
  private async callModel<T>(
    prompt: AiPrompt,
    user: AuthenticatedUser,
    ticketId: string,
    validate: (text: string) => T,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await this.limiter.run(() => this.provider.generate(prompt));
      const validated = validate(result.text);
      this.logger.log(
        `ai task=${prompt.task} mode=${this.provider.mode} outcome=ok latencyMs=${Date.now() - started} ` +
          `userId=${user.id} ticketId=${ticketId} model=${result.model} ` +
          `inputTokens=${result.inputTokens ?? 'n/a'} outputTokens=${result.outputTokens ?? 'n/a'}`,
      );
      return validated;
    } catch (error) {
      const reason: AiFailureReason =
        error instanceof AiProviderError ? error.reason : 'provider_error';
      this.logFailure(prompt.task, user.id, ticketId, reason, Date.now() - started);
      throw new AiUnavailableException(reason);
    }
  }

  private logFailure(
    task: AiTask,
    userId: string,
    ticketId: string,
    reason: AiFailureReason,
    latencyMs: number,
  ): void {
    this.logger.warn(
      `ai task=${task} mode=${this.provider.mode} outcome=failed reason=${reason} ` +
        `latencyMs=${latencyMs} userId=${userId} ticketId=${ticketId}`,
    );
  }

  private async activeCategories(): Promise<PromptCategory[]> {
    const rows = await this.prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: MAX_PROMPT_CATEGORIES,
      select: { id: true, name: true },
    });
    return rows;
  }

  /** Public comments only, oldest first, bodies only — no author identity. */
  private async publicComments(ticketId: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.ticketComment.findMany({
      where: { ticketId, visibility: CommentVisibility.Public, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { body: true },
    });
    return rows.reverse().map((row) => row.body);
  }

  /**
   * Candidate articles come from KnowledgeBaseService.findAll — the same
   * single visibility rule as every KB route (ADR-022) — never a second
   * query of our own. `publishedOnly` narrows it further; findAll ANDs
   * filters onto the visibility clause, so this can only shrink the set.
   */
  private async candidateArticles(
    ticket: { subject: string },
    user: AuthenticatedUser,
    publishedOnly: boolean,
  ): Promise<PromptArticle[]> {
    const q = buildSearchQuery(ticket.subject);
    if (q === null) {
      return [];
    }
    const query = Object.assign(new ListKnowledgeArticlesQueryDto(), {
      q,
      limit: MAX_PROMPT_ARTICLES,
      offset: 0,
      ...(publishedOnly ? { status: KnowledgeArticleStatus.Published } : {}),
    });
    const { data } = await this.knowledgeBase.findAll(query, user);
    return data.map((a) => ({ id: a.id, title: a.title, excerpt: a.excerpt }));
  }

  private async rereadArticles(
    ids: string[],
    user: AuthenticatedUser,
    publishedOnly: boolean,
  ): Promise<AiArticleReferenceDto[]> {
    if (ids.length === 0) {
      return [];
    }
    const where: Prisma.KnowledgeBaseArticleWhereInput = {
      AND: [
        knowledgeArticleVisibilityWhere(user),
        ...(publishedOnly ? [{ status: KnowledgeArticleStatus.Published }] : []),
        { id: { in: ids } },
      ],
    };
    const rows = await this.prisma.knowledgeBaseArticle.findMany({
      where,
      select: { id: true, title: true, slug: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is AiArticleReferenceDto => row !== undefined);
  }
}

function toPromptTicket(ticket: {
  subject: string;
  description: string;
  priority: string;
  status: string;
}): PromptTicket {
  return {
    subject: ticket.subject,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
  };
}

/**
 * A websearch-syntax query built from the ticket subject: distinct words
 * joined with `or`, so any one matching term recalls an article (a plain
 * AND of every word of a subject matches almost nothing). Letters and digits
 * only, so ticket text can never smuggle search operators.
 */
export function buildSearchQuery(subject: string): string | null {
  const words = (subject.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length >= MIN_SEARCH_WORD_LENGTH,
  );
  const unique = [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
  return unique.length > 0 ? unique.join(' or ') : null;
}
