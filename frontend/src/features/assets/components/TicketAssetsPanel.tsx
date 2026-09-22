import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import type { TicketAsset, UserSummary } from '../../../types/api';
import { useIsStaff } from '../../auth/useAuth';
import { useTicketAssets, useUnlinkTicketAsset, useUpdateAssetAssignment } from '../useAssets';
import { AssetLinkPicker } from './AssetLinkPicker';
import { AssetStatusBadge } from './AssetStatusBadge';

const LINK_CLASSES =
  'font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

function TicketAssetRow({
  ticketId,
  requester,
  link,
}: {
  ticketId: string;
  requester: UserSummary;
  link: TicketAsset;
}) {
  const isStaff = useIsStaff();
  const { asset } = link;
  const unlinkAsset = useUnlinkTicketAsset(ticketId);
  const assignToRequester = useUpdateAssetAssignment(asset.id);
  const [messages, setMessages] = useState<string[]>([]);

  // Deliberately NOT hyperlinked and no unlink/assign affordance for an
  // Employee (D4) — `GET /assets/:id` is row-scoped, and an Employee linked
  // to a ticket about someone else's equipment would otherwise land on a 404
  // that itself hints the asset exists.
  if (!isStaff) {
    return (
      <li className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <p className="font-medium text-slate-900">
          {asset.assetTag} — {asset.name}
        </p>
        <div className="mt-1">
          <AssetStatusBadge status={asset.status} />
        </div>
      </li>
    );
  }

  // Offered only while the asset is available in stock — the same rationale
  // `AssetAssignmentControl` documents for "Assign to me": it is only ever
  // rendered while unassigned, so the backend's "already assigned to this
  // exact person" 400 can never be reached from here, and there is no way
  // for this narrow `AssetSummary` (no `currentAssignee`) to know who
  // currently holds an already-assigned asset in order to guard that case
  // directly.
  const canAssignToRequester = asset.status === 'InStock';

  function handleUnlink() {
    setMessages([]);
    unlinkAsset.mutate(asset.id, {
      onError: (error) => setMessages(toApiError(error).messages),
    });
  }

  function handleAssignToRequester() {
    setMessages([]);
    assignToRequester.mutate(
      { assignedToId: requester.id },
      { onError: (error) => setMessages(toApiError(error).messages) },
    );
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <Link to={`/assets/${asset.id}`} className={LINK_CLASSES}>
        {asset.assetTag} — {asset.name}
      </Link>
      <div className="mt-1">
        <AssetStatusBadge status={asset.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {canAssignToRequester ? (
          <Button
            variant="secondary"
            disabled={assignToRequester.isPending}
            onClick={handleAssignToRequester}
          >
            Assign to requester
          </Button>
        ) : null}
        <Button
          variant="secondary"
          disabled={unlinkAsset.isPending}
          onClick={handleUnlink}
        >
          Unlink
        </Button>
      </div>
      {/* Mounted unconditionally; only the text inside is swapped. A live
          region inserted with its content already present is not reliably
          announced (same rationale as `TicketDetailPage`). */}
      <div aria-live="assertive">
        {messages.length > 0 ? (
          <p className="mt-2 text-sm font-medium text-red-700">
            {messages.join(' ')}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export interface TicketAssetsPanelProps {
  ticketId: string;
  requester: UserSummary;
}

/**
 * The ticket detail page's linked-assets panel.
 *
 * `GET /tickets/:id/assets` is readable by anyone who can already see the
 * ticket, so the query itself always runs; what differs by role is what is
 * offered on top of the same rows (D4).
 */
export function TicketAssetsPanel({ ticketId, requester }: TicketAssetsPanelProps) {
  const isStaff = useIsStaff();
  const ticketAssetsQuery = useTicketAssets(ticketId);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <Card heading="Assets">
      <div className="flex flex-col gap-3">
        {ticketAssetsQuery.isPending ? (
          <Spinner label="Loading linked assets" />
        ) : null}

        {ticketAssetsQuery.isError ? (
          <ErrorState
            title="Could not load linked assets"
            messages={toApiError(ticketAssetsQuery.error).messages}
            onRetry={() => void ticketAssetsQuery.refetch()}
          />
        ) : null}

        {ticketAssetsQuery.isSuccess && ticketAssetsQuery.data.length === 0 ? (
          <p className="text-sm text-slate-600">
            No assets are linked to this ticket.
          </p>
        ) : null}

        {ticketAssetsQuery.isSuccess && ticketAssetsQuery.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {ticketAssetsQuery.data.map((link) => (
              <TicketAssetRow
                key={link.asset.id}
                ticketId={ticketId}
                requester={requester}
                link={link}
              />
            ))}
          </ul>
        ) : null}

        {isStaff ? (
          pickerOpen ? (
            <AssetLinkPicker
              ticketId={ticketId}
              excludeAssetIds={(ticketAssetsQuery.data ?? []).map(
                (link) => link.asset.id,
              )}
              onLinked={() => setPickerOpen(false)}
              onCancel={() => setPickerOpen(false)}
            />
          ) : (
            <div>
              <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                Link an asset
              </Button>
            </div>
          )
        ) : null}
      </div>
    </Card>
  );
}
