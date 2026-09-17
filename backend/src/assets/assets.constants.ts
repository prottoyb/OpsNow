import { AssetStatus } from '@prisma/client';

/**
 * Statuses from which an asset cannot be handed to a user: it is not
 * physically available. Enforced explicitly as validation (400) before
 * the assignment CAS, so a blocked transition reads as "you may not do
 * this" rather than as a lost concurrency race (409).
 *
 * A return (assignedToId: null) is deliberately NOT blocked — an asset
 * that is somehow still held while InRepair/Retired/Lost must always be
 * returnable, otherwise it could never leave that state cleanly.
 */
export const UNASSIGNABLE_STATUSES: readonly AssetStatus[] = [
  AssetStatus.InRepair,
  AssetStatus.Retired,
  AssetStatus.Lost,
];

export function isAssignableStatus(status: AssetStatus): boolean {
  return !(UNASSIGNABLE_STATUSES as AssetStatus[]).includes(status);
}
