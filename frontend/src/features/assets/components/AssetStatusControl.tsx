import { Button } from '../../../components/ui/Button';
import type { AssetStatus } from '../../../types/api';
import { assetStatusLabel } from './AssetStatusBadge';

export interface AssetStatusControlProps {
  status: AssetStatus;
  /** Whether the asset currently has an assignee. */
  hasAssignee: boolean;
  submitting: boolean;
  onChange: (status: AssetStatus) => void;
}

/**
 * Non-assignment status transitions only — `InStock`, `InRepair`, `Retired`,
 * `Lost`. `Assigned` is never offered here: `PATCH /assets/:id` rejects it
 * outright (D5), because assignment is only ever granted through
 * `AssetAssignmentControl` -> `PATCH /assets/:id/assignment`, which keeps
 * `status` and `currentAssignee` from drifting apart.
 *
 * Disabled with a visible reason while the asset has a current assignee —
 * the backend rejects ANY status change on an assigned asset, so offering
 * these buttons would only produce a 400 the user cannot anticipate.
 */
export function AssetStatusControl({
  status,
  hasAssignee,
  submitting,
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
  );
}
