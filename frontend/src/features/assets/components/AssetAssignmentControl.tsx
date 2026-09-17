import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { Textarea } from '../../../components/ui/Textarea';
import { fullName } from '../../../lib/format';
import type { AssetStatus, AssignAssetInput, UserSummary } from '../../../types/api';
import { FIELD_LIMITS } from '../../../types/api';
import { assetStatusLabel } from '../assetStatus';

export interface AssetAssignmentControlProps {
  status: AssetStatus;
  currentAssignee: UserSummary | null;
  currentUserId: string;
  submitting: boolean;
  /** Backend validation messages for the last assignment attempt, rendered verbatim. */
  serverMessages?: string[];
  onAssign: (input: AssignAssetInput) => void;
}

/**
 * PRESENTATION ONLY — mirrors `UNASSIGNABLE_STATUSES` in
 * `backend/src/assets/assets.constants.ts` so the assign action can be
 * REPLACED by an explanation instead of offered and rejected (prose rather
 * than a disabled button, which assistive technology would skip past without
 * announcing why). Grants nothing; the backend re-validates on every request.
 */
const UNASSIGNABLE_STATUSES: readonly AssetStatus[] = [
  'InRepair',
  'Retired',
  'Lost',
];

/**
 * D1: the only assignment targets offered from the asset detail page are
 * "Assign to me" and "Return to stock" — there is no user picker and no
 * arbitrary uuid entry. ("Assign to requester" is a separate affordance on
 * the ticket detail page's linked-asset row, `TicketAssetsPanel`.)
 *
 * A notes field is offered only alongside "Assign to me": that action is
 * only ever rendered while the asset is unassigned, which is always a real
 * assignment change, so the backend's "no-op + notes is a 400" case can
 * never be reached from here. "Return to stock" has no notes field — the
 * backend ignores `notes` entirely on a return (it closes the existing
 * ledger row rather than opening one), so showing a box that silently
 * discards what was typed would be worse than not offering it.
 */
export function AssetAssignmentControl({
  status,
  currentAssignee,
  currentUserId,
  submitting,
  serverMessages = [],
  onAssign,
}: AssetAssignmentControlProps) {
  const [notes, setNotes] = useState('');

  // The live region is mounted unconditionally and its content swapped
  // inside, never inserted into the DOM already containing its text — see
  // the comment in `TicketDetailPage` for why the latter is not reliably
  // announced.
  const errors = (
    <div aria-live="assertive">
      {serverMessages.length > 0 ? (
        <p className="text-sm font-medium text-red-700">
          {serverMessages.join(' ')}
        </p>
      ) : null}
    </div>
  );

  if (currentAssignee) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-700">
          <span className="font-medium">Assigned to: </span>
          {fullName(currentAssignee)}
          {currentAssignee.id === currentUserId ? ' (you)' : ''}
        </p>
        <div>
          <Button
            variant="secondary"
            disabled={submitting}
            // `assignedToId` is required-but-nullable: the key is always sent.
            onClick={() => onAssign({ assignedToId: null })}
          >
            Return to stock
          </Button>
        </div>
        {errors}
      </div>
    );
  }

  const assignable = !UNASSIGNABLE_STATUSES.includes(status);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-700">
        <span className="font-medium">Assigned to: </span>Unassigned
      </p>

      {!assignable ? (
        <p className="text-sm text-slate-600">
          Cannot assign an asset in status {assetStatusLabel(status)}; move it
          back to stock first.
        </p>
      ) : (
        <>
          <FormField
            id="asset-assignment-notes"
            label="Notes"
            hint={`Optional. Up to ${FIELD_LIMITS.assetNotes} characters. Recorded on the assignment record.`}
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                rows={2}
                value={notes}
                maxLength={FIELD_LIMITS.assetNotes}
                aria-describedby={describedBy}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </FormField>
          <div>
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={() =>
                onAssign({
                  assignedToId: currentUserId,
                  notes: notes.trim() === '' ? undefined : notes.trim(),
                })
              }
            >
              Assign to me
            </Button>
          </div>
        </>
      )}
      {errors}
    </div>
  );
}
