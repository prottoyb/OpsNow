import type { AssetStatus } from '../../types/api';

/**
 * Display labels for `AssetStatus`, kept out of `AssetStatusBadge.tsx` so that
 * file exports components only — the same split the ticket feature makes
 * between `transitions.ts` and `TicketStatusBadge.tsx`, and what
 * `react-refresh/only-export-components` requires for fast refresh to work.
 *
 * The raw enum is never rendered: "In stock", not "InStock".
 */
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
