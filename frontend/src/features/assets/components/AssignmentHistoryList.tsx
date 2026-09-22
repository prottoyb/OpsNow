import { CARD_SURFACE_CLASSES } from '../../../components/ui/Card';
import { formatDateTime, fullName, toDateTimeAttribute } from '../../../lib/format';
import type { AssetAssignment } from '../../../types/api';

/**
 * Staff-only ledger for one asset (`GET /assets/:id/assignments`) — the
 * caller never renders this for an Employee and never fires the request for
 * one either (see `useAssetAssignments`'s `enabled` gate).
 *
 * An open row (`returnedAt === null`) is the asset's current holding, not
 * just "the most recent row" — the backend closes the previous row before
 * opening a new one, so at most one row per asset is ever open at a time.
 */
export function AssignmentHistoryList({
  assignments,
}: {
  assignments: readonly AssetAssignment[];
}) {
  if (assignments.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        This asset has never been assigned.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {assignments.map((assignment) => {
        const isCurrent = assignment.returnedAt === null;
        return (
          <li key={assignment.id} className={`${CARD_SURFACE_CLASSES} text-sm`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900">
                {fullName(assignment.assignedTo)}
              </p>
              {isCurrent ? (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-inset ring-emerald-300">
                  Current holding
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Assigned by {fullName(assignment.assignedBy)} on{' '}
              <time dateTime={toDateTimeAttribute(assignment.assignedAt)}>
                {formatDateTime(assignment.assignedAt)}
              </time>
              {assignment.returnedAt ? (
                <>
                  {' '}
                  · returned{' '}
                  <time dateTime={toDateTimeAttribute(assignment.returnedAt)}>
                    {formatDateTime(assignment.returnedAt)}
                  </time>
                </>
              ) : null}
            </p>
            {assignment.notes ? (
              <p className="user-content mt-2 text-slate-700">
                {assignment.notes}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
