import { Button } from '../../../components/ui/Button';
import { fullName } from '../../../lib/format';
import type { UserSummary } from '../../../types/api';

export interface AssignmentControlProps {
  assignee: UserSummary | null;
  currentUserId: string;
  submitting: boolean;
  onAssign: (assigneeId: string | null) => void;
}

/**
 * "Assign to me" and "Unassign" only — there is deliberately no assignee
 * picker.
 *
 * Listing other staff would require `GET /api/v1/users`, which is
 * Administrator-only, has no role filter and no active flag, and returns
 * email addresses. A SupportAgent or TeamLead therefore has no way to
 * enumerate assignable staff, so the UI offers the two operations that every
 * staff role can actually perform. (A fuller assignment UI needs a
 * staff-directory endpoint first.)
 */
export function AssignmentControl({
  assignee,
  currentUserId,
  submitting,
  onAssign,
}: AssignmentControlProps) {
  const assignedToMe = assignee?.id === currentUserId;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-700">
        <span className="font-medium">Assignee: </span>
        {assignee ? fullName(assignee) : 'Unassigned'}
        {assignedToMe ? ' (you)' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {!assignedToMe ? (
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => onAssign(currentUserId)}
          >
            Assign to me
          </Button>
        ) : null}
        {assignee ? (
          <Button
            variant="secondary"
            disabled={submitting}
            // `assigneeId` is required-but-nullable: the key is always sent.
            onClick={() => onAssign(null)}
          >
            Unassign
          </Button>
        ) : null}
      </div>
    </div>
  );
}
