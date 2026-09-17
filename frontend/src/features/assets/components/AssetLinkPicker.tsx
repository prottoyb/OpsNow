import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Input } from '../../../components/ui/Input';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import { AssetStatusBadge } from './AssetStatusBadge';
import { useAssetList, useLinkTicketAsset } from '../useAssets';

const SEARCH_DEBOUNCE_MS = 300;
/** Mirrors `ListAssetsQueryDto.q`'s `@MaxLength(100)`. */
const SEARCH_MAX_LENGTH = 100;

export interface AssetLinkPickerProps {
  ticketId: string;
  /** Asset ids already linked to this ticket — filtered out of results. */
  excludeAssetIds: readonly string[];
  onLinked?: () => void;
  onCancel?: () => void;
}

/**
 * Staff-only search-and-link control for a ticket's asset panel.
 *
 * Always renders a result LIST rather than auto-selecting a single match:
 * `serialNumber` is not unique (`GET /assets?q=`'s free-text search spans
 * assetTag, name AND serialNumber), so one search term can legitimately
 * return several distinct assets and the person must pick the right one.
 */
export function AssetLinkPicker({
  ticketId,
  excludeAssetIds,
  onLinked,
  onCancel,
}: AssetLinkPickerProps) {
  const [draft, setDraft] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [linkMessages, setLinkMessages] = useState<string[]>([]);

  useEffect(() => {
    const trimmed = draft.trim().slice(0, SEARCH_MAX_LENGTH);
    const timeout = setTimeout(() => setCommittedQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [draft]);

  const searchQuery = useAssetList(
    { q: committedQuery, limit: 10 },
    committedQuery !== '',
  );
  const linkAsset = useLinkTicketAsset(ticketId);

  const results = (searchQuery.data?.data ?? []).filter(
    (asset) => !excludeAssetIds.includes(asset.id),
  );

  function handleLink(assetId: string) {
    setLinkMessages([]);
    linkAsset.mutate(assetId, {
      onSuccess: () => {
        setDraft('');
        setCommittedQuery('');
        onLinked?.();
      },
      onError: (error) => setLinkMessages(toApiError(error).messages),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="asset-link-search"
          className="text-sm font-medium text-slate-900"
        >
          Search assets
        </label>
        <Input
          id="asset-link-search"
          type="search"
          placeholder="Tag, name or serial number"
          value={draft}
          maxLength={SEARCH_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>

      {committedQuery === '' ? (
        <p className="text-sm text-slate-600">
          Type to search assets by tag, name or serial number.
        </p>
      ) : null}

      {committedQuery !== '' && searchQuery.isPending ? (
        <Spinner label="Searching assets" />
      ) : null}

      {searchQuery.isError ? (
        <ErrorState
          title="Could not search assets"
          messages={toApiError(searchQuery.error).messages}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : null}

      {committedQuery !== '' && searchQuery.isSuccess && results.length === 0 ? (
        <p className="text-sm text-slate-600">
          No matching assets. Every match may already be linked.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {results.map((asset) => (
            <li
              key={asset.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {asset.assetTag} — {asset.name}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <AssetStatusBadge status={asset.status} />
                  <span className="text-xs text-slate-600">
                    {asset.assetType.name}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                disabled={linkAsset.isPending}
                onClick={() => handleLink(asset.id)}
              >
                Link
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Mounted unconditionally; only the text inside is swapped. A live
          region inserted with its content already present is not reliably
          announced (same rationale as `TicketDetailPage`). */}
      <div aria-live="assertive">
        {linkMessages.length > 0 ? (
          <p className="text-sm font-medium text-red-700">
            {linkMessages.join(' ')}
          </p>
        ) : null}
      </div>

      {onCancel ? (
        <div>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
