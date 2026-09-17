import { useCallback } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import type {
  AssignAssetInput,
  CreateAssetInput,
  ListAssetsQuery,
  UpdateAssetInput,
} from '../../types/api';
import * as api from './assets.api';

/**
 * Every key is namespaced by the signed-in user id.
 *
 * What a given asset endpoint returns depends on who is asking — an
 * Employee is server-scoped to the assets currently assigned to them.
 * Keying by user means two identities can never collide on one cache entry.
 * `AuthContext` additionally calls `queryClient.clear()` on any identity
 * change, so this is belt and braces on a confidentiality boundary.
 */
export const assetKeys = {
  /** Every list for this user, whatever its filters — the invalidation target. */
  lists: (userId: string) => ['assets', userId, 'list'] as const,
  list: (userId: string, query: ListAssetsQuery) =>
    ['assets', userId, 'list', query] as const,
  detail: (userId: string, assetId: string) =>
    ['assets', userId, 'detail', assetId] as const,
  assignments: (userId: string, assetId: string) =>
    ['assets', userId, 'assignments', assetId] as const,
  types: (userId: string) => ['asset-types', userId] as const,
  ticketAssets: (userId: string, ticketId: string) =>
    ['ticket-assets', userId, ticketId] as const,
  /**
   * Every ticket's linked-asset list for this user. The invalidation target
   * when an asset changes: the embedded `AssetSummary` carries `status`, and
   * one asset can be linked to several tickets, so a status or assignment
   * change staleness-affects every one of them — not just the ticket the
   * change happened to be made from.
   */
  ticketAssetsAll: (userId: string) => ['ticket-assets', userId] as const,
};

function useUserId(): string {
  const { user } = useAuth();
  // Queries only run behind ProtectedRoute, so a user is always present in
  // practice; the fallback keeps the key type simple.
  return user?.id ?? 'anonymous';
}

export function useAssetList(query: ListAssetsQuery, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: assetKeys.list(userId, query),
    queryFn: () => api.listAssets(query),
    // Keeps the current page visible while the next one loads instead of
    // collapsing the table back to a skeleton on every filter change.
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAsset(assetId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: assetKeys.detail(userId, assetId),
    queryFn: () => api.getAsset(assetId),
  });
}

export function useAssetTypes() {
  const userId = useUserId();
  return useQuery({
    queryKey: assetKeys.types(userId),
    queryFn: api.listAssetTypes,
    // Asset types are effectively static within a session.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Staff-only endpoint. `enabled` keeps an Employee from firing a request
 * that can only ever come back 403 — a UI nicety, not the access control,
 * which lives in the backend controller's `@Roles()` guard and again in
 * `AssetsService.findAssignments()`.
 */
export function useAssetAssignments(assetId: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: assetKeys.assignments(userId, assetId),
    queryFn: () => api.listAssetAssignments(assetId, { limit: 100 }),
    enabled,
  });
}

function invalidateAsset(
  queryClient: QueryClient,
  userId: string,
  assetId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: assetKeys.detail(userId, assetId),
  });
  void queryClient.invalidateQueries({
    queryKey: assetKeys.assignments(userId, assetId),
  });
  // Any asset change can move it in or out of the active list filter.
  void queryClient.invalidateQueries({
    queryKey: assetKeys.lists(userId),
  });
  // A status or assignment change alters the `AssetSummary.status` embedded
  // in every ticket that links this asset, so all of them are invalidated —
  // not only the ticket a panel-initiated change came from.
  void queryClient.invalidateQueries({
    queryKey: assetKeys.ticketAssetsAll(userId),
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: CreateAssetInput) => api.createAsset(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assetKeys.lists(userId),
      });
    },
  });
}

export function useUpdateAsset(assetId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: UpdateAssetInput) => api.updateAsset(assetId, input),
    onSuccess: () => invalidateAsset(queryClient, userId, assetId),
  });
}

/**
 * Takes no ticket context: `invalidateAsset` already invalidates every
 * ticket's linked-asset list, which is what an assignment change needs —
 * the asset's status is embedded in each of those rows, and the asset may be
 * linked to more tickets than the one the change was made from.
 */
export function useUpdateAssetAssignment(assetId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (input: AssignAssetInput) =>
      api.updateAssetAssignment(assetId, input),
    onSuccess: () => invalidateAsset(queryClient, userId, assetId),
  });
}

export function useTicketAssets(ticketId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: assetKeys.ticketAssets(userId, ticketId),
    queryFn: () => api.listTicketAssets(ticketId),
  });
}

export function useLinkTicketAsset(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (assetId: string) => api.linkTicketAsset(ticketId, assetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assetKeys.ticketAssets(userId, ticketId),
      });
    },
  });
}

export function useUnlinkTicketAsset(ticketId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (assetId: string) => api.unlinkTicketAsset(ticketId, assetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assetKeys.ticketAssets(userId, ticketId),
      });
    },
  });
}

/** Refetches everything on an asset — used by the 403/409 recovery paths. */
export function useRefetchAsset(assetId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useCallback(
    () => invalidateAsset(queryClient, userId, assetId),
    [queryClient, userId, assetId],
  );
}
