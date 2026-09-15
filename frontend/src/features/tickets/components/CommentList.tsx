import { Badge } from '../../../components/ui/Badge';
import { formatDateTime, fullName, toDateTimeAttribute } from '../../../lib/format';
import type { TicketComment } from '../../../types/api';

export interface CommentListProps {
  comments: readonly TicketComment[];
  /** True only for staff. See the note below on what this is and is not. */
  canSeeInternal: boolean;
}

export function CommentList({ comments, canSeeInternal }: CommentListProps) {
  /*
   * The security boundary for internal notes is SERVER-side:
   * `TicketsService.findComments()` applies `visibility: Public` to both the
   * rows and the count for a non-staff caller, so an Employee's response
   * never contains an internal note in the first place — and the total does
   * not leak how many exist.
   *
   * This filter is defence in depth for a single failure mode (a future
   * endpoint or cache returning more than it should); it must never be
   * treated as the control itself. The `visibility` field's real UI job is
   * the staff-facing "Internal note" badge below.
   */
  const visible = canSeeInternal
    ? comments
    : comments.filter((comment) => comment.visibility === 'Public');

  if (visible.length === 0) {
    return (
      <p className="text-sm text-slate-600">No comments on this ticket yet.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visible.map((comment) => (
        <li
          key={comment.id}
          className={`rounded-md border p-3 ${
            comment.visibility === 'Internal'
              ? 'border-amber-300 bg-amber-50'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-900">
              {fullName(comment.author)}
            </span>
            <time
              dateTime={toDateTimeAttribute(comment.createdAt)}
              className="text-xs text-slate-500"
            >
              {formatDateTime(comment.createdAt)}
            </time>
            {comment.visibility === 'Internal' ? (
              <Badge tone="warning">Internal note</Badge>
            ) : null}
          </div>
          {/*
            Plain React text node. Line breaks are preserved by CSS
            (`user-content` sets white-space: pre-wrap) — never by injecting
            markup.
          */}
          <p className="user-content mt-2 text-sm text-slate-800">
            {comment.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
