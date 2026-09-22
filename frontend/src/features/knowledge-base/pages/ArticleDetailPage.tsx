import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ErrorState, InlineNotice } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { DetailPageSkeleton, Spinner } from '../../../components/ui/Spinner';
import { Tabs } from '../../../components/ui/Tabs';
import { toApiError } from '../../../lib/api/errors';
import {
  formatDateTime,
  fullName,
  toDateTimeAttribute,
} from '../../../lib/format';
import type {
  KnowledgeArticle,
  KnowledgeArticleStatus,
  UpdateArticleInput,
} from '../../../types/api';
import { useAuth, useIsStaff } from '../../auth/useAuth';
import {
  articleStatusLabel,
  canChangeArticleStatus,
  canEditAnyArticle,
} from '../articleStatus';
import { ArticleFeedbackLog } from '../components/ArticleFeedbackLog';
import { ArticleFeedbackWidget } from '../components/ArticleFeedbackWidget';
import { ArticleForm } from '../components/ArticleForm';
import type { ArticleFormValues } from '../components/ArticleForm';
import { ArticleStatusBadge } from '../components/ArticleStatusBadge';
import { ArticleStatusControl } from '../components/ArticleStatusControl';
import {
  useArticle,
  useArticleFeedbackLog,
  useKnowledgeBaseCategories,
  useRefetchArticle,
  useSubmitArticleFeedback,
  useUpdateArticle,
} from '../useKnowledgeBase';

interface Notice {
  tone: 'warning' | 'success';
  text: string;
}

const CONFLICT_TEXT =
  'Someone else changed this article while you were working on it. The latest version has been reloaded — please review it and try again.';

/**
 * Renders the article body.
 *
 * **This is a security decision, not a styling one.** `content` is
 * user-authored text that every Employee in the organisation reads, and it is
 * rendered here as a React TEXT NODE, which escapes by construction. It is
 * deliberately NOT parsed as Markdown or HTML, and `dangerouslySetInnerHTML`
 * is never used — `src/test/guards.test.ts` asserts its absence across the
 * whole of `src/` so this cannot regress.
 *
 * A Markdown or HTML renderer here would be a stored-XSS surface: any author
 * (every staff role can write an article) could plant script or a
 * `javascript:` link that then executes in the session of every reader,
 * including an Administrator. Nothing in the requirements asks for rich
 * formatting, so the surface simply is not opened. Line breaks — the one
 * piece of structure a plain-text runbook genuinely needs — are preserved by
 * CSS (`whitespace-pre-wrap`), which cannot execute anything.
 */
function ArticleBody({ content }: { content: string }) {
  // `max-w-prose` (~65ch) and a slightly opened leading are a reading-comfort
  // improvement only — an unconstrained full-bleed line at 7xl page width
  // was measurably too wide to scan comfortably for runbook-length prose.
  return (
    <p className="mt-3 max-w-prose text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-800">
      {content}
    </p>
  );
}

export function ArticleDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isStaff = useIsStaff();
  const role = user?.role ?? 'Employee';

  const articleQuery = useArticle(id);
  // Not requested at all for an Employee: the endpoint is staff-only and
  // would only ever answer 403.
  const feedbackLogQuery = useArticleFeedbackLog(id, isStaff);
  const categoriesQuery = useKnowledgeBaseCategories();
  const refetchArticle = useRefetchArticle(id);

  // Two separate mutation instances over the same `PATCH /kb-articles/:id`
  // endpoint — there is no dedicated status route on this resource — so the
  // edit form's "Saving…" state and the status control's never bleed into
  // each other.
  const updateArticle = useUpdateArticle(id);
  const updateStatus = useUpdateArticle(id);
  const submitFeedback = useSubmitArticleFeedback(id);

  const [activeTab, setActiveTab] = useState('feedback');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editMessages, setEditMessages] = useState<string[]>([]);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [feedbackMessages, setFeedbackMessages] = useState<string[]>([]);

  /** See `TicketDetailPage.closeEditForm` for the full rationale. */
  function closeEditForm() {
    setEditing(false);
    setEditMessages([]);
  }

  function handleMutationError(
    error: unknown,
    setMessages?: (m: string[]) => void,
  ) {
    const apiError = toApiError(error);

    if (apiError.isConflict) {
      setNotice({ tone: 'warning', text: CONFLICT_TEXT });
      closeEditForm();
      refetchArticle();
      return;
    }
    /*
     * A 403 landing here means the UI's role check disagreed with the server:
     * the role affordances below are only what is *offered*, and the backend
     * is the gate (a SupportAgent editing a colleague's article, or sending
     * `status` at all). Explain it, close the form, and reload — leaving the
     * stale view up would invite the same doomed retry.
     */
    if (apiError.isForbidden) {
      setNotice({ tone: 'warning', text: apiError.messages[0] });
      closeEditForm();
      refetchArticle();
      return;
    }
    if (setMessages) {
      setMessages(apiError.messages);
      return;
    }
    setNotice({ tone: 'warning', text: apiError.messages[0] });
  }

  if (articleQuery.isPending) {
    return <DetailPageSkeleton label="Loading article" />;
  }

  if (articleQuery.isError) {
    return renderLoadError(articleQuery.error, () =>
      void articleQuery.refetch(),
    );
  }

  const article = articleQuery.data;

  // A SupportAgent owns what they wrote; a TeamLead or Administrator may
  // correct anyone's. An Employee never edits. Mirrors
  // `KnowledgeBaseService.assertMayEditContent`.
  const canEdit =
    isStaff && (canEditAnyArticle(role) || article.author.id === user?.id);
  const canPublish = canChangeArticleStatus(role);

  function handleEditSubmit(values: ArticleFormValues) {
    setEditMessages([]);

    // Minimal diff only — `forbidNonWhitelisted` turns any extra property
    // into a 400, and `status` is never included here (owned entirely by
    // `ArticleStatusControl` below, and a 403 for a SupportAgent).
    const input: UpdateArticleInput = {};
    if (values.title !== article.title) input.title = values.title;
    if (values.content !== article.content) input.content = values.content;
    // Unlike a ticket's, an article's category can be CLEARED: an explicit
    // null is how an article leaves its category.
    const currentCategoryId = article.category?.id ?? '';
    if (values.categoryId !== currentCategoryId) {
      input.categoryId = values.categoryId === '' ? null : values.categoryId;
    }

    if (Object.keys(input).length === 0) {
      setEditing(false);
      return;
    }

    updateArticle.mutate(input, {
      onSuccess: () => {
        setEditing(false);
        setNotice({ tone: 'success', text: 'Article updated.' });
      },
      onError: (error) => handleMutationError(error, setEditMessages),
    });
  }

  function handleStatusChange(status: KnowledgeArticleStatus) {
    setNotice(null);
    setStatusMessages([]);
    updateStatus.mutate(
      { status },
      {
        onSuccess: (updated) =>
          setNotice({
            tone: 'success',
            text: `Article is now ${articleStatusLabel(updated.status)}.`,
          }),
        onError: (error) => handleMutationError(error, setStatusMessages),
      },
    );
  }

  function handleFeedbackSubmit(isHelpful: boolean, comment: string) {
    setNotice(null);
    setFeedbackMessages([]);
    // An empty comment is OMITTED rather than sent as '': the backend treats
    // an absent `comment` as "clear whatever was there", which is exactly the
    // documented re-vote behaviour, while '' would fail `@IsNotEmpty`-style
    // trimming expectations for no benefit.
    submitFeedback.mutate(
      comment === '' ? { isHelpful } : { isHelpful, comment },
      {
        onSuccess: () =>
          setNotice({ tone: 'success', text: 'Thanks for the feedback.' }),
        onError: (error) => handleMutationError(error, setFeedbackMessages),
      },
    );
  }

  const feedbackPanel = (
    <div className="flex flex-col gap-4">
      {feedbackLogQuery.isPending ? <Spinner label="Loading feedback" /> : null}
      {feedbackLogQuery.isError ? (
        <ErrorState
          title="Could not load feedback"
          messages={toApiError(feedbackLogQuery.error).messages}
          onRetry={() => void feedbackLogQuery.refetch()}
        />
      ) : null}
      {feedbackLogQuery.isSuccess ? (
        <ArticleFeedbackLog entries={feedbackLogQuery.data.data} />
      ) : null}
    </div>
  );

  // The reader feedback log exists for staff only — it pairs free text with
  // the identity of whoever wrote it. Mirrors `TicketDetailPage`'s History.
  const tabs = isStaff
    ? [{ id: 'feedback', label: 'Reader feedback', panel: feedbackPanel }]
    : [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeading>{article.title}</PageHeading>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          Shown to staff only, for the same reason the list badge is: an
          Employee only ever reaches a Published article, so the badge would
          be a constant.
        */}
        {isStaff ? <ArticleStatusBadge status={article.status} /> : null}
        <span className="text-sm text-slate-600">
          {article.category?.name ?? 'Uncategorised'}
        </span>
      </div>

      {/*
        Rendered unconditionally and the notice swapped inside it — see
        `TicketDetailPage` for why a live region inserted with its text
        already present is not reliably announced.
      */}
      <div aria-live="polite" aria-atomic="true">
        {notice ? (
          <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card heading="Article">
            {editing && canEdit ? (
              <div>
                <ArticleForm
                  initialValues={{
                    title: article.title,
                    content: article.content,
                    categoryId: article.category?.id ?? '',
                  }}
                  categories={categoriesQuery.data ?? []}
                  submitting={updateArticle.isPending}
                  serverMessages={editMessages}
                  submitLabel="Save changes"
                  onSubmit={handleEditSubmit}
                  onCancel={closeEditForm}
                />
              </div>
            ) : (
              <>
                <ArticleBody content={article.content} />
                {canEdit ? (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(true)}
                    >
                      Edit article
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Card>

          <ArticleFeedbackWidget
            feedback={article.feedback}
            submitting={submitFeedback.isPending}
            serverMessages={feedbackMessages}
            onSubmit={handleFeedbackSubmit}
          />

          {tabs.length > 0 ? (
            <Tabs
              tabs={tabs}
              activeId={activeTab}
              onChange={setActiveTab}
              label="Article activity"
            />
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          {canPublish ? (
            <Card heading="Publishing">
              <ArticleStatusControl
                status={article.status}
                submitting={updateStatus.isPending}
                serverMessages={statusMessages}
                onChange={handleStatusChange}
              />
            </Card>
          ) : null}

          <ArticleMetadata article={article} showStatus={isStaff} />
        </aside>
      </div>
    </section>
  );
}

function ArticleMetadata({
  article,
  showStatus,
}: {
  article: KnowledgeArticle;
  showStatus: boolean;
}) {
  return (
    <Card heading="About">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium text-slate-700">Author</dt>
        <dd className="text-slate-800">{fullName(article.author)}</dd>
        {showStatus ? (
          <>
            <dt className="font-medium text-slate-700">Status</dt>
            <dd className="text-slate-800">
              {articleStatusLabel(article.status)}
            </dd>
          </>
        ) : null}
        <dt className="font-medium text-slate-700">Category</dt>
        <dd className="text-slate-800">
          {article.category?.name ?? 'Uncategorised'}
        </dd>
        {article.publishedAt ? (
          <>
            <dt className="font-medium text-slate-700">Published</dt>
            <dd className="text-slate-800">
              <time dateTime={toDateTimeAttribute(article.publishedAt)}>
                {formatDateTime(article.publishedAt)}
              </time>
            </dd>
          </>
        ) : null}
        <dt className="font-medium text-slate-700">Updated</dt>
        <dd className="text-slate-800">
          <time dateTime={toDateTimeAttribute(article.updatedAt)}>
            {formatDateTime(article.updatedAt)}
          </time>
        </dd>
        <dt className="font-medium text-slate-700">Views</dt>
        <dd className="text-slate-800">{article.viewCount}</dd>
      </dl>
    </Card>
  );
}

function renderLoadError(error: unknown, retry: () => void) {
  const apiError = toApiError(error);

  /*
   * 404 copy must never hint that the article might exist but be out of scope
   * — a Draft is unreviewed internal writing whose mere EXISTENCE says what
   * the support team is working on, which is why the backend answers 404 and
   * never 403 for one an Employee cannot see.
   */
  if (apiError.isNotFound) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeading>Article not found</PageHeading>
        <p className="text-sm text-slate-600">
          We could not find that article.
        </p>
        <Link
          to="/kb"
          className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Back to the knowledge base
        </Link>
      </section>
    );
  }

  // `ParseUUIDPipe` runs before the handler, so a malformed id is a 400, not
  // a 404 — the same "no such article" outcome needs its own branch.
  if (apiError.isValidationError) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeading>Invalid article reference</PageHeading>
        <p className="text-sm text-slate-600">
          That article reference is not valid.
        </p>
        <Link
          to="/kb"
          className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Back to the knowledge base
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <PageHeading>Article</PageHeading>
      <ErrorState
        title="Could not load this article"
        messages={apiError.messages}
        onRetry={retry}
      />
    </section>
  );
}
