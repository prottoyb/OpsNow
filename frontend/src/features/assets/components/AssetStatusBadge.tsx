import { Badge } from '../../../components/ui/Badge';
import type { BadgeTone } from '../../../components/ui/Badge';
import type { AssetStatus } from '../../../types/api';

const STATUS_LABELS: Record<AssetStatus, string> = {
  InStock: 'In stock',
  Assigned: 'Assigned',
  InRepair: 'In repair',
  Retired: 'Retired',
  Lost: 'Lost',
};

export function assetStatusLabel(status: AssetStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Tone is decoration only — the badge always renders the status as text, so
 * nothing is conveyed by colour alone (WCAG 1.4.1).
 */
const STATUS_TONES: Record<AssetStatus, BadgeTone> = {
  InStock: 'info',
  Assigned: 'success',
  InRepair: 'warning',
  Retired: 'neutral',
  Lost: 'danger',
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} srPrefix="Status:">
      {assetStatusLabel(status)}
    </Badge>
  );
}
