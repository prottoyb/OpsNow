import { Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

/**
 * Per-row asset visibility scoping — the asset-domain counterpart of
 * `ticket-visibility.ts` (see DECISIONS.md ADR-019): an Employee may only
 * see the assets currently assigned to them; staff may see any
 * (non-soft-deleted) asset.
 *
 * Lives here, service-free, for the same reason ticket visibility does:
 * AssetsService builds every asset query's `where` from it, and the rule
 * stays importable by any other module that needs asset scoping without
 * pulling in AssetsService itself (and without a circular import).
 */
export function assetVisibilityWhere(
  user: AuthenticatedUser,
): Prisma.AssetWhereInput {
  return {
    deletedAt: null,
    ...(user.role === Role.Employee ? { currentAssigneeId: user.id } : {}),
  };
}
