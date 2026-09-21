import { Button } from '../../../components/ui/Button';
import type { KnowledgeArticleStatus } from '../../../types/api';
import {
  allowedArticleTransitions,
  articleStatusLabel,
  articleTransitionLabel,
} from '../articleStatus';

export interface ArticleStatusControlProps {
  status: KnowledgeArticleStatus;
  submitting: boolean;
  /** Backend validation messages, rendered verbatim. */
  serverMessages: string[];
  onChange: (status: KnowledgeArticleStatus) => void;
}

/**
 * Publish / unpublish / archive, for TeamLead and Administrator only — the
 * caller renders this at all only for those roles, and a SupportAgent sending
 * `status` is a 403 on the backend even on their own article.
 *
 * Buttons are generated from the transition matrix rather than listed by
 * hand, so the UI can never offer a move the backend rejects. Most visibly:
 * an Archived article offers only "Restore to draft" — never a direct
 * republish, because retired guidance is re-reviewed as a draft before it is
 * authoritative again.
 */
export function ArticleStatusControl({
  status,
  submitting,
  serverMessages,
  onChange,
}: ArticleStatusControlProps) {
  const transitions = allowedArticleTransitions(status);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-700">
        <span className="font-medium">Current: </span>
        {articleStatusLabel(status)}
      </p>

      <div className="flex flex-wrap gap-2">
        {transitions.map((next) => (
          <Button
            key={next}
            variant="secondary"
            disabled={submitting}
            onClick={() => onChange(next)}
          >
            {articleTransitionLabel(status, next)}
          </Button>
        ))}
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
  );
}
