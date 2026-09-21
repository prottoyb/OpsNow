import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { KnowledgeArticleStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import {
  knowledgeArticleVisibilitySql,
  knowledgeArticleVisibilityWhere as buildArticleVisibilityWhere,
} from '../common/knowledge-article-visibility';
import {
  KnowledgeBaseCategoriesService,
  toKnowledgeBaseCategoryResponse,
} from '../knowledge-base-categories/knowledge-base-categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { isStaffRole } from '../tickets/tickets.constants';
import { toUserSummary } from '../users/users.service';
import { CreateArticleFeedbackDto } from './dto/create-article-feedback.dto';
import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import {
  KnowledgeArticleFeedbackListResponseDto,
  KnowledgeArticleFeedbackResponseDto,
  KnowledgeArticleFeedbackSummaryDto,
} from './dto/knowledge-article-feedback-response.dto';
import { KnowledgeArticleResponseDto } from './dto/knowledge-article-response.dto';
import {
  KnowledgeArticleListResponseDto,
  KnowledgeArticleSummaryResponseDto,
} from './dto/knowledge-article-summary-response.dto';
import { ListArticleFeedbackQueryDto } from './dto/list-article-feedback-query.dto';
import { ListKnowledgeArticlesQueryDto } from './dto/list-knowledge-articles-query.dto';
import { TicketKnowledgeArticleResponseDto } from './dto/ticket-knowledge-article-response.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';
import {
  canChangeArticleStatus,
  canEditAnyArticle,
  isAllowedArticleTransition,
} from './knowledge-base.constants';
import { slugForAttempt, toExcerpt, toSlug } from './knowledge-base.text';

const articleInclude = {
  category: true,
  author: true,
} as const;

type ArticleWithRelations = Prisma.KnowledgeBaseArticleGetPayload<{
  include: typeof articleInclude;
}>;

const ticketArticleInclude = {
  article: { include: articleInclude },
  linkedBy: true,
} as const;

type TicketArticleWithRelations = Prisma.TicketKnowledgeArticleGetPayload<{
  include: typeof ticketArticleInclude;
}>;

const feedbackInclude = { user: true } as const;

type FeedbackWithRelations = Prisma.KnowledgeBaseArticleFeedbackGetPayload<{
  include: typeof feedbackInclude;
}>;

const CONFLICT_MESSAGE =
  'Knowledge article was modified by another request; reload and retry';

const NOT_FOUND_MESSAGE = 'Knowledge article not found';

/** Bounded, because the retry exists to survive a slug collision, not to
 * paper over a systematically broken slug function. Five attempts covers
 * "How to Reset Your Password" being written five times; a sixth is a
 * signal, not a hiccup. */
const MAX_SLUG_ATTEMPTS = 5;

interface FeedbackCounts {
  helpfulCount: number;
  notHelpfulCount: number;
}

const NO_FEEDBACK: FeedbackCounts = { helpfulCount: 0, notHelpfulCount: 0 };

function toFeedbackResponse(
  feedback: FeedbackWithRelations,
): KnowledgeArticleFeedbackResponseDto {
  return {
    id: feedback.id,
    isHelpful: feedback.isHelpful,
    comment: feedback.comment,
    createdAt: feedback.createdAt,
    user: toUserSummary(feedback.user),
  };
}

/**
 * The projection used in list rows and wherever an article is EMBEDDED in
 * another resource. Carries `excerpt`, never `content` — see
 * KnowledgeArticleSummaryResponseDto for why that boundary exists.
 */
export function toKnowledgeArticleSummaryResponse(
  article: ArticleWithRelations,
  counts: FeedbackCounts,
): KnowledgeArticleSummaryResponseDto {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
    excerpt: toExcerpt(article.content),
    category: article.category
      ? toKnowledgeBaseCategoryResponse(article.category)
      : null,
    author: toUserSummary(article.author),
    publishedAt: article.publishedAt,
    viewCount: article.viewCount,
    updatedAt: article.updatedAt,
    helpfulCount: counts.helpfulCount,
    notHelpfulCount: counts.notHelpfulCount,
  };
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: KnowledgeBaseCategoriesService,
  ) {}

  // -------------------------------------------------------------------
  // Articles
  // -------------------------------------------------------------------

  async create(
    dto: CreateKnowledgeArticleDto,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    // Defense-in-depth: independently verify staff-only access here too,
    // not just via the controller's @Roles() guard (backend.md).
    this.assertStaff(user, 'Only staff can create a knowledge article');

    if (dto.categoryId !== undefined) {
      await this.assertActiveCategory(dto.categoryId);
    }

    const baseSlug = toSlug(dto.title);

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      try {
        const created = await this.prisma.knowledgeBaseArticle.create({
          data: {
            title: dto.title,
            content: dto.content,
            categoryId: dto.categoryId ?? null,
            // The author is always the caller, never a submitted value:
            // authorship is provenance, and it is what the SupportAgent
            // ownership rule in update() is decided on.
            authorId: user.id,
            slug: slugForAttempt(baseSlug, attempt),
            // An article is always born a Draft with no publication
            // instant. Publishing is a separate, more privileged act (see
            // knowledge-base.constants.ts).
            status: KnowledgeArticleStatus.Draft,
            publishedAt: null,
          },
        });

        this.logger.log(
          `Knowledge article ${created.id} created by user ${user.id}`,
        );

        return this.detailById(created.id, user);
      } catch (error) {
        // Retry ONLY a slug collision, and only while attempts remain.
        // A uniqueness pre-check would be a TOCTOU race that two
        // concurrent creates of the same title would both pass; letting
        // the unique index be the arbiter is the only correct version.
        if (this.isSlugConflict(error) && attempt < MAX_SLUG_ATTEMPTS) {
          continue;
        }
        if (this.isSlugConflict(error)) {
          throw new ConflictException(
            'Could not derive a unique slug for this title; try a more specific title',
          );
        }
        return this.mapPrismaError(error);
      }
    }

    // Unreachable: the loop either returns or throws on its last attempt.
    throw new ConflictException(
      'Could not derive a unique slug for this title; try a more specific title',
    );
  }

  async findAll(
    query: ListKnowledgeArticlesQueryDto,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleListResponseDto> {
    // An all-whitespace `q` is trimmed to '' by the DTO; treat that as
    // "no search term" rather than searching for nothing.
    const term = query.q?.trim() ? query.q.trim() : undefined;

    if (term !== undefined) {
      return this.searchAll(term, query, user);
    }

    // Visibility is ANDed as its own top-level clause — not spread
    // alongside the filters — so a filter (e.g. `status`) can never
    // overwrite, and thereby silently disable, the scoping. This is also
    // what makes `status`/`authorId` safe to expose to every role: they
    // can only narrow what the visibility clause already allows.
    const where = this.buildFilterWhere(query, user);

    const [articles, total] = await Promise.all([
      this.prisma.knowledgeBaseArticle.findMany({
        where,
        include: articleInclude,
        take: query.limit,
        skip: query.offset,
        // Freshest published guidance first. NULLS LAST keeps drafts
        // (which have no publishedAt) out of the top of a staff listing;
        // `updatedAt` then orders those by recent editing activity, and
        // `id` is the stable tie-breaker that keeps pagination
        // deterministic when two rows share both timestamps.
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.knowledgeBaseArticle.count({ where }),
    ]);

    return { data: await this.toSummaries(articles), total };
  }

  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    const article = await this.getVisibleArticleOrThrow(id, user);

    const viewCount = await this.recordView(article);

    return this.buildDetail({ ...article, viewCount }, user);
  }

  async update(
    id: string,
    dto: UpdateKnowledgeArticleDto,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    this.assertStaff(user, 'Only staff can update a knowledge article');

    const article = await this.getVisibleArticleOrThrow(id, user);

    const editsContent =
      dto.title !== undefined ||
      dto.content !== undefined ||
      dto.categoryId !== undefined;

    if (editsContent) {
      this.assertMayEditContent(article, user);
    }
    if (dto.status !== undefined) {
      // Checked on PRESENCE, not on change: a SupportAgent submitting
      // `status` is rejected even when the value happens to equal the
      // current one, so "may I publish?" is answered consistently rather
      // than depending on the article's current state.
      this.assertMayChangeStatus(user);
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.assertActiveCategory(dto.categoryId);
    }

    // "Unchecked" variant: sets categoryId as a plain scalar FK rather
    // than via a relation `connect`, since updateMany (unlike update)
    // only accepts scalar mutations.
    const data: Prisma.KnowledgeBaseArticleUncheckedUpdateManyInput = {};

    if (dto.title !== undefined && dto.title !== article.title) {
      // `slug` is deliberately NOT recomputed here. It is generated once
      // at creation and frozen thereafter: a slug that chased the title
      // would break every link, bookmark and ticket reference that has
      // ever pointed at this article, which is the opposite of what a
      // stable identifier is for. Retitling is an editorial act; breaking
      // inbound links should not be a side effect of one.
      data.title = dto.title;
    }
    if (dto.content !== undefined && dto.content !== article.content) {
      data.content = dto.content;
    }
    if (dto.categoryId !== undefined && dto.categoryId !== article.categoryId) {
      data.categoryId = dto.categoryId;
    }

    if (dto.status !== undefined && dto.status !== article.status) {
      if (!isAllowedArticleTransition(article.status, dto.status)) {
        throw new BadRequestException(
          `A knowledge article cannot move from ${article.status} to ${dto.status}`,
        );
      }
      data.status = dto.status;
      if (dto.status === KnowledgeArticleStatus.Published) {
        // Refreshed on EVERY publish, including a re-publish after an
        // unpublish: `publishedAt` answers "when did this last become
        // authoritative", which is what the default list ordering sorts
        // on. Unpublishing and archiving deliberately leave it alone —
        // it stays as the record of the last publication rather than
        // being erased.
        data.publishedAt = new Date();
      }
    }

    if (Object.keys(data).length === 0) {
      return this.buildDetail(article, user);
    }

    try {
      // Conditional update gates the write on the row being unchanged
      // since we read it (matched by `updatedAt`) and still in the
      // caller's visibility scope. In particular it closes the window
      // where a concurrent edit lands between the transition validation
      // above and this write.
      const updated = await this.prisma.knowledgeBaseArticle.updateMany({
        // Visibility is ANDed as its own clause rather than spread in
        // alongside the CAS pins: spreading lets a key collision silently
        // replace a pin, and this helper genuinely does yield a `status`
        // key for an Employee.
        where: {
          AND: [
            this.articleVisibilityWhere(user),
            { id: article.id, updatedAt: article.updatedAt },
          ],
        },
        data,
      });
      if (updated.count !== 1) {
        throw new ConflictException(CONFLICT_MESSAGE);
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      return this.mapPrismaError(error);
    }

    this.logger.log(
      `Knowledge article ${article.id} updated by user ${user.id}`,
    );

    // Deliberately NOT findOne(): re-reading through the public route
    // would run the view counter, so publishing an article would credit
    // it with a read nobody performed.
    return this.detailById(id, user);
  }

  // No delete endpoint, by design. `Archived` is the retire path: a
  // knowledge article is referenced by feedback rows and by tickets whose
  // resolution cited it, so destroying one would quietly rewrite that
  // history. Soft-deleted rows (deletedAt) are honoured on read for the
  // same reason, but nothing in this API sets the column.

  // -------------------------------------------------------------------
  // Feedback
  // -------------------------------------------------------------------

  /**
   * Records the caller's vote on an article they can SEE — no staff gate,
   * because an Employee rating the guidance they were given is the whole
   * point. Article visibility does the scoping: a Draft is a 404 to an
   * Employee here exactly as it is on the read route.
   */
  async submitFeedback(
    id: string,
    dto: CreateArticleFeedbackDto,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleFeedbackSummaryDto> {
    const article = await this.getVisibleArticleOrThrow(id, user);

    try {
      // Upsert, not create: `(articleId, userId)` is unique, and a reader
      // changing their mind is normal rather than an error. One person
      // holds one current opinion of an article, so the new vote REPLACES
      // the old one — including its comment, which is why omitting
      // `comment` clears whatever was there rather than preserving a note
      // that no longer belongs to the vote it was written for.
      await this.prisma.knowledgeBaseArticleFeedback.upsert({
        where: {
          articleId_userId: { articleId: article.id, userId: user.id },
        },
        create: {
          articleId: article.id,
          userId: user.id,
          isHelpful: dto.isHelpful,
          comment: dto.comment ?? null,
        },
        update: {
          isHelpful: dto.isHelpful,
          comment: dto.comment ?? null,
        },
      });
    } catch (error) {
      return this.mapPrismaError(error);
    }

    return this.buildFeedbackSummary(article.id, user);
  }

  /**
   * The staff-only feedback log: every comment, with its author.
   *
   * Gated twice on purpose — @Roles on the route and this check — because
   * the payload is the one genuinely sensitive thing in this module. See
   * KnowledgeArticleFeedbackResponseDto for the reasoning.
   */
  async findFeedback(
    id: string,
    query: ListArticleFeedbackQueryDto,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleFeedbackListResponseDto> {
    this.assertStaff(user, 'Only staff can read knowledge article feedback');

    await this.getVisibleArticleOrThrow(id, user);

    const where: Prisma.KnowledgeBaseArticleFeedbackWhereInput = {
      articleId: id,
    };

    const [feedback, total] = await Promise.all([
      this.prisma.knowledgeBaseArticleFeedback.findMany({
        where,
        include: feedbackInclude,
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.knowledgeBaseArticleFeedback.count({ where }),
    ]);

    return { data: feedback.map(toFeedbackResponse), total };
  }

  // -------------------------------------------------------------------
  // Ticket <-> article links
  // -------------------------------------------------------------------

  /**
   * Knowledge articles linked to one ticket.
   *
   * Ticket visibility is the caller's responsibility: TicketsService
   * resolves the ticket through its own visibility helper first, so a
   * ticket the caller cannot see never reaches this method.
   *
   * Unlike the ticket <-> ASSET equivalent, that is NOT the only scoping
   * here: the linked articles are additionally filtered by the caller's
   * own article visibility. The asset case could rely on a uniformly
   * narrow projection because every field an Employee must not see was
   * simply absent from it. Here the sensitive thing is not a field but
   * the row's EXISTENCE — telling a requester that a Draft article is
   * attached to their ticket reveals that the support team has unreleased
   * internal guidance about their problem, which is precisely what
   * `knowledge-article-visibility.ts` exists to withhold.
   */
  async findForTicket(
    ticketId: string,
    user: AuthenticatedUser,
  ): Promise<TicketKnowledgeArticleResponseDto[]> {
    const links = await this.prisma.ticketKnowledgeArticle.findMany({
      where: { ticketId, article: this.articleVisibilityWhere(user) },
      include: ticketArticleInclude,
      orderBy: [{ linkedAt: 'desc' }, { articleId: 'desc' }],
    });

    const counts = await this.feedbackCountsFor(
      links.map((link) => link.articleId),
    );

    return links.map((link) => ({
      ticketId: link.ticketId,
      linkedAt: link.linkedAt,
      linkedBy: link.linkedBy ? toUserSummary(link.linkedBy) : null,
      article: toKnowledgeArticleSummaryResponse(
        link.article,
        counts.get(link.articleId) ?? NO_FEEDBACK,
      ),
    }));
  }

  /**
   * Links an article to a ticket. Idempotent: linking an already-linked
   * article returns the existing link untouched rather than failing on
   * the composite primary key. Ticket visibility is the caller's
   * responsibility (see findForTicket).
   */
  async linkToTicket(
    ticketId: string,
    articleId: string,
    user: AuthenticatedUser,
  ): Promise<TicketKnowledgeArticleResponseDto> {
    this.assertStaff(
      user,
      'Only staff can link a knowledge article to a ticket',
    );

    // Deliberately NOT the visibility clause: only staff reach this path,
    // and staff see every non-deleted article. Linking a Draft is a
    // legitimate "we are writing this up for you" action.
    const article = await this.prisma.knowledgeBaseArticle.findFirst({
      where: { id: articleId, deletedAt: null },
      select: { id: true },
    });
    if (!article) {
      throw new BadRequestException(
        'articleId does not refer to an existing knowledge article',
      );
    }

    const existing = await this.findTicketArticleLink(ticketId, articleId);
    if (existing) {
      return this.toTicketArticleResponse(existing);
    }

    try {
      const created = await this.prisma.ticketKnowledgeArticle.create({
        data: { ticketId, articleId, linkedById: user.id },
        include: ticketArticleInclude,
      });
      return this.toTicketArticleResponse(created);
    } catch (error) {
      // Lost the race against a concurrent link of the same pair: the
      // result the caller asked for exists, so return it rather than
      // surfacing a conflict for an operation defined as idempotent.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const link = await this.findTicketArticleLink(ticketId, articleId);
        if (link) {
          return this.toTicketArticleResponse(link);
        }
        // The link vanished again between the failed insert and this
        // re-read (the competing writer rolled back, or unlinked).
        throw new ConflictException(
          'Could not link the knowledge article to the ticket; retry',
        );
      }
      return this.mapPrismaError(error);
    }
  }

  /**
   * Removes a ticket <-> article link. Idempotent: unlinking something
   * that is not linked succeeds silently. Ticket visibility is the
   * caller's responsibility (see findForTicket).
   */
  async unlinkFromTicket(
    ticketId: string,
    articleId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    this.assertStaff(
      user,
      'Only staff can unlink a knowledge article from a ticket',
    );

    await this.prisma.ticketKnowledgeArticle.deleteMany({
      where: { ticketId, articleId },
    });
  }

  // -------------------------------------------------------------------
  // Full-text search
  // -------------------------------------------------------------------

  /**
   * The `q` path.
   *
   * `search_vector` is a STORED generated tsvector column (see the init
   * migration) that Prisma models as `Unsupported("tsvector")` and cannot
   * put in a `where`, so this one query has to drop to raw SQL. Every
   * value is still a bound parameter — the fragments below are composed
   * with `Prisma.sql`/`Prisma.join`, never string concatenation — so a
   * term like `'; DROP TABLE users;--` is just text to match.
   *
   * The visibility and filter predicates are deliberately built from the
   * SAME helper the Prisma path uses (`knowledge-article-visibility.ts`),
   * because a raw query with a weaker visibility clause than its ORM twin
   * is the highest-risk bug available in this module. The hydration step
   * below then re-applies the Prisma clause as a second, independent
   * gate.
   */
  private async searchAll(
    term: string,
    query: ListKnowledgeArticlesQueryDto,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleListResponseDto> {
    const conditions: Prisma.Sql[] = [
      knowledgeArticleVisibilitySql(user),
      Prisma.sql`a.search_vector @@ query`,
    ];
    if (query.categoryId) {
      conditions.push(Prisma.sql`a.category_id = ${query.categoryId}::uuid`);
    }
    if (query.status) {
      conditions.push(
        Prisma.sql`a.status = ${query.status}::"KnowledgeArticleStatus"`,
      );
    }
    if (query.authorId) {
      conditions.push(Prisma.sql`a.author_id = ${query.authorId}::uuid`);
    }
    const where = Prisma.join(conditions, ' AND ');

    // `websearch_to_tsquery`, never `to_tsquery`: the latter parses its
    // argument as a boolean tsquery expression and RAISES on anything
    // malformed, so a user typing `a & | b`, a bare `!`, or an unbalanced
    // quote would produce a 500 from the driver. `websearch_to_tsquery`
    // is total over arbitrary text — it accepts the Google-ish syntax
    // people already expect ("quoted phrase", -excluded, or) and silently
    // ignores anything it cannot parse. That makes it a correctness
    // requirement here, not a preference.
    const tsquery = Prisma.sql`websearch_to_tsquery('english', ${term})`;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT a.id
        FROM "knowledge_base_articles" a, ${tsquery} AS query
        WHERE ${where}
        ORDER BY ts_rank(a.search_vector, query) DESC,
                 a.published_at DESC NULLS LAST,
                 a.id ASC
        LIMIT ${query.limit} OFFSET ${query.offset}
      `),
      this.prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "knowledge_base_articles" a, ${tsquery} AS query
        WHERE ${where}
      `),
    ]);

    const total = countRows[0]?.count ?? 0;
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return { data: [], total };
    }

    const articles = await this.prisma.knowledgeBaseArticle.findMany({
      // The ids already passed the raw visibility predicate; re-asserting
      // the Prisma clause here is a cheap second gate, so a future edit
      // that weakened the SQL above would still not leak a Draft.
      where: { AND: [this.articleVisibilityWhere(user), { id: { in: ids } }] },
      include: articleInclude,
    });

    // `findMany({ id: { in: [...] } })` returns rows in whatever order
    // Postgres produces them, which discards the relevance ranking the
    // raw query just computed. Re-sort to the id order that came back.
    const byId = new Map(articles.map((article) => [article.id, article]));
    const ranked = ids
      .map((id) => byId.get(id))
      .filter((article): article is ArticleWithRelations => article !== undefined);

    return { data: await this.toSummaries(ranked), total };
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private buildFilterWhere(
    query: ListKnowledgeArticlesQueryDto,
    user: AuthenticatedUser,
  ): Prisma.KnowledgeBaseArticleWhereInput {
    return {
      AND: [
        this.articleVisibilityWhere(user),
        ...(query.categoryId ? [{ categoryId: query.categoryId }] : []),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.authorId ? [{ authorId: query.authorId }] : []),
      ],
    };
  }

  /**
   * Increments `view_count` for a Published article and returns the count
   * the caller should see.
   *
   * Three decisions worth stating:
   *
   * 1. Published only. A staff member previewing their own Draft, or
   *    auditing an Archived article, is not a reader — counting those
   *    would make the metric measure editing activity rather than
   *    readership.
   * 2. Raw UPDATE rather than `prisma.updateMany`. Prisma writes
   *    `@updatedAt` on every update it issues, so an ORM increment would
   *    move `updated_at` on every READ: it would reorder the list (whose
   *    secondary key is updatedAt) by view activity, and it would make
   *    the optimistic-concurrency pin in update() fire spurious 409s
   *    whenever anyone happened to open the article mid-edit. The counter
   *    is metadata about reads, not a modification of the article.
   * 3. Post-increment. The count returned includes this read, so a reader
   *    who refreshes sees a number that moved. Reporting the pre-
   *    increment value would make the first view of an article always
   *    read 0, which looks broken.
   *
   * A failure here never fails the read: a counter is not worth a 500 on
   * a working article.
   */
  private async recordView(article: ArticleWithRelations): Promise<number> {
    if (article.status !== KnowledgeArticleStatus.Published) {
      return article.viewCount;
    }

    try {
      const affected = await this.prisma.$executeRaw`
        UPDATE "knowledge_base_articles"
        SET "view_count" = "view_count" + 1
        WHERE "id" = ${article.id}::uuid
          AND "status" = 'Published'
          AND "deleted_at" IS NULL
      `;
      return affected === 1 ? article.viewCount + 1 : article.viewCount;
    } catch (error) {
      this.logger.warn(
        `Could not increment view count for knowledge article ${article.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      return article.viewCount;
    }
  }

  private async detailById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    const article = await this.getVisibleArticleOrThrow(id, user);
    return this.buildDetail(article, user);
  }

  private async buildDetail(
    article: ArticleWithRelations,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleResponseDto> {
    const feedback = await this.buildFeedbackSummary(article.id, user);

    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      status: article.status,
      category: article.category
        ? toKnowledgeBaseCategoryResponse(article.category)
        : null,
      author: toUserSummary(article.author),
      publishedAt: article.publishedAt,
      viewCount: article.viewCount,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      feedback,
    };
  }

  private async toSummaries(
    articles: ArticleWithRelations[],
  ): Promise<KnowledgeArticleSummaryResponseDto[]> {
    const counts = await this.feedbackCountsFor(
      articles.map((article) => article.id),
    );
    return articles.map((article) =>
      toKnowledgeArticleSummaryResponse(
        article,
        counts.get(article.id) ?? NO_FEEDBACK,
      ),
    );
  }

  /** One grouped query for a whole page, rather than an aggregate per
   * row — the list would otherwise issue up to 100 extra round trips. */
  private async feedbackCountsFor(
    articleIds: string[],
  ): Promise<Map<string, FeedbackCounts>> {
    const counts = new Map<string, FeedbackCounts>();
    if (articleIds.length === 0) {
      return counts;
    }

    const grouped = await this.prisma.knowledgeBaseArticleFeedback.groupBy({
      by: ['articleId', 'isHelpful'],
      where: { articleId: { in: articleIds } },
      _count: { _all: true },
    });

    for (const row of grouped) {
      const current = counts.get(row.articleId) ?? { ...NO_FEEDBACK };
      if (row.isHelpful) {
        current.helpfulCount = row._count._all;
      } else {
        current.notHelpfulCount = row._count._all;
      }
      counts.set(row.articleId, current);
    }

    return counts;
  }

  /** Aggregates for everyone, plus the CALLER's own vote — never anybody
   * else's comment. See KnowledgeArticleFeedbackSummaryDto. */
  private async buildFeedbackSummary(
    articleId: string,
    user: AuthenticatedUser,
  ): Promise<KnowledgeArticleFeedbackSummaryDto> {
    const [counts, mine] = await Promise.all([
      this.feedbackCountsFor([articleId]),
      this.prisma.knowledgeBaseArticleFeedback.findFirst({
        where: { articleId, userId: user.id },
      }),
    ]);

    const { helpfulCount, notHelpfulCount } =
      counts.get(articleId) ?? NO_FEEDBACK;

    return {
      helpfulCount,
      notHelpfulCount,
      myFeedback: mine
        ? {
            isHelpful: mine.isHelpful,
            comment: mine.comment,
            createdAt: mine.createdAt,
          }
        : null,
    };
  }

  private async toTicketArticleResponse(
    link: TicketArticleWithRelations,
  ): Promise<TicketKnowledgeArticleResponseDto> {
    const counts = await this.feedbackCountsFor([link.articleId]);
    return {
      ticketId: link.ticketId,
      linkedAt: link.linkedAt,
      linkedBy: link.linkedBy ? toUserSummary(link.linkedBy) : null,
      article: toKnowledgeArticleSummaryResponse(
        link.article,
        counts.get(link.articleId) ?? NO_FEEDBACK,
      ),
    };
  }

  private async findTicketArticleLink(
    ticketId: string,
    articleId: string,
  ): Promise<TicketArticleWithRelations | null> {
    return this.prisma.ticketKnowledgeArticle.findFirst({
      where: { ticketId, articleId },
      include: ticketArticleInclude,
    });
  }

  private articleVisibilityWhere(
    user: AuthenticatedUser,
  ): Prisma.KnowledgeBaseArticleWhereInput {
    return buildArticleVisibilityWhere(user);
  }

  private assertStaff(user: AuthenticatedUser, message: string): void {
    if (!isStaffRole(user.role)) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * A SupportAgent owns what they wrote; a TeamLead or Administrator may
   * correct anyone's work.
   *
   * 403 and not 404, deliberately: staff CAN read every non-deleted
   * article, so the caller is not being told about something they were
   * unaware of. 404 is reserved strictly for articles outside the
   * caller's visibility scope.
   */
  private assertMayEditContent(
    article: ArticleWithRelations,
    user: AuthenticatedUser,
  ): void {
    if (canEditAnyArticle(user.role) || article.authorId === user.id) {
      return;
    }
    throw new ForbiddenException(
      'You can only edit knowledge articles you authored',
    );
  }

  private assertMayChangeStatus(user: AuthenticatedUser): void {
    if (!canChangeArticleStatus(user.role)) {
      throw new ForbiddenException(
        'Only a TeamLead or Administrator can publish, unpublish or archive a knowledge article',
      );
    }
  }

  /** Out-of-scope and soft-deleted articles are indistinguishable from
   * nonexistent ones (404, never 403) — ADR-019's safe-not-found rule. */
  private async getVisibleArticleOrThrow(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ArticleWithRelations> {
    const article = await this.prisma.knowledgeBaseArticle.findFirst({
      where: { id, ...this.articleVisibilityWhere(user) },
      include: articleInclude,
    });
    if (!article) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    return article;
  }

  private async assertActiveCategory(categoryId: string): Promise<void> {
    const category = await this.categoriesService.findActiveById(categoryId);
    if (!category) {
      throw new BadRequestException(
        'categoryId does not refer to an active knowledge base category',
      );
    }
  }

  private isSlugConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    // `slug` is the only unique constraint on this table, but check the
    // reported target anyway so a future one cannot be mistaken for a
    // slug collision and silently retried under a different slug.
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('slug');
    }
    return typeof target === 'string' ? target.includes('slug') : true;
  }

  private mapPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A knowledge article with this slug already exists',
        );
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('Referenced record no longer exists');
      }
      // No P2025 branch: this service only ever issues create/upsert/
      // updateMany/deleteMany, and a missing row surfaces as `count: 0`
      // and is handled at the call site.
    }
    throw error as Error;
  }
}
