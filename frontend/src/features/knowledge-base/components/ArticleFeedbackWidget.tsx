import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { Textarea } from '../../../components/ui/Textarea';
import { formatDateTime, toDateTimeAttribute } from '../../../lib/format';
import type { ArticleFeedbackSummary } from '../../../types/api';
import { FIELD_LIMITS } from '../../../types/api';

export interface ArticleFeedbackWidgetProps {
  feedback: ArticleFeedbackSummary;
  submitting: boolean;
  /** Backend validation messages, rendered verbatim. */
  serverMessages: string[];
  onSubmit: (isHelpful: boolean, comment: string) => void;
}

/**
 * "Was this helpful?" — offered to every role, including Employees: rating
 * the guidance you were given is the point of the feature, and
 * `POST /kb-articles/:id/feedback` is open to anyone who can already see the
 * article.
 *
 * The vote is an UPSERT: one person holds one current opinion, so re-voting
 * replaces the previous vote *including its comment*. Submitting with the
 * comment box empty therefore clears a note left earlier, which the form
 * states in so many words rather than leaving as a surprise — the comment box
 * is pre-filled with the existing note precisely so that the common case
 * (change the vote, keep the note) does not silently discard it.
 *
 * Only the caller's own vote and the two aggregate counts are shown here.
 * Other readers' comments are staff-only and live in `ArticleFeedbackLog`.
 */
export function ArticleFeedbackWidget({
  feedback,
  submitting,
  serverMessages,
  onSubmit,
}: ArticleFeedbackWidgetProps) {
  const { myFeedback } = feedback;
  const [comment, setComment] = useState(myFeedback?.comment ?? '');

  return (
    <section
      aria-labelledby="article-feedback-heading"
      className="rounded-md border border-slate-200 bg-white p-4"
    >
      <h2
        id="article-feedback-heading"
        className="text-base font-semibold text-slate-900"
      >
        Was this helpful?
      </h2>

      <p className="mt-1 text-sm text-slate-600">
        {feedback.helpfulCount} found this helpful, {feedback.notHelpfulCount}{' '}
        did not.
      </p>

      {myFeedback ? (
        <p className="mt-2 text-sm text-slate-700">
          You said this article was{' '}
          <span className="font-medium">
            {myFeedback.isHelpful ? 'helpful' : 'not helpful'}
          </span>{' '}
          on{' '}
          <time dateTime={toDateTimeAttribute(myFeedback.createdAt)}>
            {formatDateTime(myFeedback.createdAt)}
          </time>
          . You can change your answer at any time.
        </p>
      ) : null}

      {/*
        One group, two buttons each carrying a vote: the comment belongs to
        whichever answer is given, so there is deliberately no separate "send
        comment" action that could leave a note attached to no vote. The
        buttons are ordinary <button type="button"> (Button's default), so
        this is a labelled control group rather than a <form> with two
        competing submitters.
      */}
      <div className="mt-3 flex flex-col gap-3">
        <FormField
          id="article-feedback-comment"
          label="Comment for the support team"
          hint={`Optional, up to ${FIELD_LIMITS.articleFeedbackComment} characters. Only the support team sees it. Answering with this box empty removes any comment you left before.`}
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              name="comment"
              rows={3}
              value={comment}
              maxLength={FIELD_LIMITS.articleFeedbackComment}
              aria-describedby={describedBy}
              onChange={(event) => setComment(event.target.value)}
            />
          )}
        </FormField>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={myFeedback?.isHelpful === true ? 'primary' : 'secondary'}
            disabled={submitting}
            aria-pressed={myFeedback?.isHelpful === true}
            onClick={() => onSubmit(true, comment.trim())}
          >
            Yes, this helped
          </Button>
          <Button
            variant={myFeedback?.isHelpful === false ? 'primary' : 'secondary'}
            disabled={submitting}
            aria-pressed={myFeedback?.isHelpful === false}
            onClick={() => onSubmit(false, comment.trim())}
          >
            No, it did not
          </Button>
        </div>

        {/* Mounted unconditionally; only the text inside is swapped. A live
            region inserted with its content already present is not reliably
            announced (same rationale as `TicketDetailPage`). */}
        <div aria-live="assertive">
          {serverMessages.length > 0 ? (
            <p className="text-sm font-medium text-red-700">
              {serverMessages.join(' ')}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
