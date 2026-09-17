import { Button } from '../../../components/ui/Button';
import type { AssetStatus } from '../../../types/api';
import { assetStatusLabel } from '../assetStatus';

export interface AssetStatusControlProps {
  status: AssetStatus;
  /** Whether the asset currently has an assignee. */
  hasAssignee: boolean;
  submitting: boolean;
  /** Backend validation messages for the last status change, rendered verbatim. */
  serverMessages?: string[];
  onChange: (status: AssetStatus) => void;
}

/**
 * Non-assignment status transitions only — `InStock`, `InRepair`, `Retired`,
 * `Lost`. `Assigned` is never offered here: `PATCH /assets/:id` rejects it
 * outright (D5), because assignment is only ever granted through
 * `AssetAssignmentControl` -> `PATCH /assets/:id/assignment`, which keeps
 * `status` and `currentAssignee` from drifting apart.
 *
 * While the asset has a current assignee the buttons are REPLACED by an
 * explanation rather than merely disabled — the backend rejects ANY status
 * change on an assigned asset, so offering these buttons would only produce
 * a 400 the user cannot anticipate. Prose beats a disabled control here: a
 * disabled button is skipped by most screen-reader controls navigation, so
 * the reason it cannot be used would never be announced.
 */
export function AssetStatusControl({
  status,
  hasAssignee,
  submitting,
  serverMessages = [],
  onChange,
}: AssetStatusControlProps) {
  if (hasAssignee) {
    return (
      <p className="text-sm text-slate-600">
        This asset is currently assigned. Return it to stock before changing
        its status.
      </p>
    );
  }

  const options: AssetStatus[] = (
    ['InStock', 'InRepair', 'Retired', 'Lost'] as const
  ).filter((option) => option !== status);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            variant="secondary"
            disabled={submitting}
            onClick={() => onChange(option)}
          >
            Move to {assetStatusLabel(option)}
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
