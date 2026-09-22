import { Badge } from '../../../components/ui/Badge';
import { CARD_SURFACE_CLASSES } from '../../../components/ui/Card';
import {
  formatDateTime,
  fullName,
  toDateTimeAttribute,
} from '../../../lib/format';
import type { ArticleFeedbackEntry } from '../../../types/api';

/**
 * The STAFF-ONLY feedback log. Every row pairs a free-text comment with the
 * identity of the colleague who wrote it, believing only the support team
 * would read it — which is why `GET /kb-articles/:id/feedback` is role-gated
 * twice on the backend and why this component is never rendered for an
 * Employee. The caller is responsible for that gating; this file only lays
 * the rows out.
 *
 * Comments are rendered as React text nodes, like every other piece of
 * user-authored content here.
 */
export function ArticleFeedbackLog({
  entries,
}: {
  entries: readonly ArticleFeedbackEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Nobody has rated this article yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} className={`${CARD_SURFACE_CLASSES} text-sm`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={entry.isHelpful ? 'success' : 'warning'}
              srPrefix="Rating:"
            >
              {entry.isHelpful ? 'Helpful' : 'Not helpful'}
            </Badge>
            <span className="font-medium text-slate-900">
              {fullName(entry.user)}
            </span>
            <time
              dateTime={toDateTimeAttribute(entry.createdAt)}
              className="text-xs text-slate-600"
            >
              {formatDateTime(entry.createdAt)}
            </time>
          </div>
          {entry.comment ? (
            <p className="user-content mt-2 text-slate-800">{entry.comment}</p>
          ) : (
            <p className="mt-2 text-slate-600">No comment left.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
