import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { AssetType } from '../../../types/api';
import { ASSET_STATUSES } from '../../../types/api';
import { assetStatusLabel } from './AssetStatusBadge';
import { AssetTypeSelect } from './AssetTypeSelect';
import type { AssetListFilters } from '../useAssetListParams';

export interface AssetFiltersProps {
  filters: AssetListFilters;
  assetTypes: readonly AssetType[];
  hasActiveFilters: boolean;
  onChange: (next: Partial<AssetListFilters>) => void;
  onClear: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;
/** Mirrors `ListAssetsQueryDto.q`'s `@MaxLength(100)`. */
const SEARCH_MAX_LENGTH = 100;

/**
 * Staff only — the caller renders this section at all only for staff. An
 * Employee's list is already row-scoped to their own assigned equipment
 * (D3), so there is nothing left here for them to narrow.
 */
export function AssetFilters({
  filters,
  assetTypes,
  hasActiveFilters,
  onChange,
  onClear,
}: AssetFiltersProps) {
  // Local, debounced draft so every keystroke does not trigger a request —
  // the committed value (and therefore the URL/query) only updates after a
  // short pause, mirroring the ~300ms debounce called for in the plan.
  const [searchDraft, setSearchDraft] = useState(filters.q ?? '');

  useEffect(() => {
    setSearchDraft(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const trimmed = searchDraft.trim();
    if (trimmed === (filters.q ?? '')) {
      return;
    }
    const timeout = setTimeout(() => {
      onChange({ q: trimmed || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchDraft, filters.q, onChange]);

  return (
    <section
      aria-labelledby="asset-filters-heading"
      className="rounded-md border border-slate-200 bg-white p-4"
    >
      <h2 id="asset-filters-heading" className="sr-only">
        Filter assets
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="asset-filter-status"
            className="text-sm font-medium text-slate-900"
          >
            Status
          </label>
          <Select
            id="asset-filter-status"
            value={filters.status ?? ''}
            onChange={(event) =>
              onChange({
                status: (event.target.value ||
                  undefined) as AssetListFilters['status'],
              })
            }
          >
            <option value="">Any status</option>
            {ASSET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {assetStatusLabel(status)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="asset-filter-type"
            className="text-sm font-medium text-slate-900"
          >
            Asset type
          </label>
          <AssetTypeSelect
            id="asset-filter-type"
            value={filters.assetTypeId ?? ''}
            assetTypes={assetTypes}
            noneLabel="Any type"
            onChange={(assetTypeId) =>
              onChange({ assetTypeId: assetTypeId || undefined })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="asset-filter-q"
            className="text-sm font-medium text-slate-900"
          >
            Search
          </label>
          <Input
            id="asset-filter-q"
            type="search"
            placeholder="Tag, name or serial number"
            value={searchDraft}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-900">Assignee</span>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={filters.assignee === 'me'}
              onChange={(event) =>
                onChange({ assignee: event.target.checked ? 'me' : 'anyone' })
              }
              className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            />
            Assigned to me
          </label>
        </div>
      </div>

      {hasActiveFilters ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </section>
  );
}
