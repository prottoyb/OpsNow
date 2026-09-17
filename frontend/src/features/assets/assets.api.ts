import { apiFetch } from '../../lib/api/client';
import type {
  Asset,
  AssetAssignment,
  AssetType,
  AssignAssetInput,
  CreateAssetInput,
  ListAssetsQuery,
  Paginated,
  TicketAsset,
  UpdateAssetInput,
} from '../../types/api';

export function listAssets(query: ListAssetsQuery): Promise<Paginated<Asset>> {
  return apiFetch<Paginated<Asset>>('/assets', { query: { ...query } });
}

export function getAsset(id: string): Promise<Asset> {
  return apiFetch<Asset>(`/assets/${id}`);
}

export function createAsset(input: CreateAssetInput): Promise<Asset> {
  return apiFetch<Asset>('/assets', { method: 'POST', body: input });
}

/**
 * The global ValidationPipe runs with `forbidNonWhitelisted: true`, so the
 * body must contain only the fields being changed — never a whole asset
 * spread into a PATCH. `status` must never be sent from a general edit: it
 * is validated whenever present at all (see `UpdateAssetInput`), and is
 * owned by `updateAssetAssignment`/`AssetStatusControl` instead. Callers
 * build a minimal diff.
 */
export function updateAsset(id: string, input: UpdateAssetInput): Promise<Asset> {
  return apiFetch<Asset>(`/assets/${id}`, { method: 'PATCH', body: input });
}

/**
 * `assignedToId` is required-but-nullable on the backend DTO, so the key is
 * always sent: a uuid assigns, `null` returns the asset to stock.
 */
export function updateAssetAssignment(
  id: string,
  input: AssignAssetInput,
): Promise<Asset> {
  return apiFetch<Asset>(`/assets/${id}/assignment`, {
    method: 'PATCH',
    body: input,
  });
}

/** Staff-only on the backend; an Employee receives 403. */
export function listAssetAssignments(
  id: string,
  query: { limit?: number; offset?: number } = {},
): Promise<Paginated<AssetAssignment>> {
  return apiFetch<Paginated<AssetAssignment>>(`/assets/${id}/assignments`, {
    query,
  });
}

/** Returns a BARE ARRAY, not a `{data,total}` envelope. Active types only. */
export function listAssetTypes(): Promise<AssetType[]> {
  return apiFetch<AssetType[]>('/asset-types');
}

/**
 * Returns a BARE, UNPAGINATED array — the list is bounded by how many
 * assets one ticket has. Readable by anyone who can already see the ticket.
 */
export function listTicketAssets(ticketId: string): Promise<TicketAsset[]> {
  return apiFetch<TicketAsset[]>(`/tickets/${ticketId}/assets`);
}

/** Staff only. Idempotent: re-linking an already-linked asset returns the existing link. */
export function linkTicketAsset(
  ticketId: string,
  assetId: string,
): Promise<TicketAsset> {
  return apiFetch<TicketAsset>(`/tickets/${ticketId}/assets`, {
    method: 'POST',
    body: { assetId },
  });
}

/** Staff only. 204 No Content; idempotent — unlinking something not linked succeeds. */
export function unlinkTicketAsset(
  ticketId: string,
  assetId: string,
): Promise<void> {
  return apiFetch<void>(`/tickets/${ticketId}/assets/${assetId}`, {
    method: 'DELETE',
  });
}
