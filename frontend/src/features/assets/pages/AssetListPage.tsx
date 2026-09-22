import { Link } from 'react-router-dom';
import { Button, PRIMARY_LINK_CLASSES } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Pagination } from '../../../components/ui/Pagination';
import { SkeletonRows } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import { PAGE_SIZE } from '../../../types/api';
import { useAuth, useIsStaff } from '../../auth/useAuth';
import { AssetFilters } from '../components/AssetFilters';
import { AssetTable } from '../components/AssetTable';
import { useAssetList, useAssetTypes } from '../useAssets';
import { useAssetListParams } from '../useAssetListParams';

export function AssetListPage() {
  const { user } = useAuth();
  const isStaff = useIsStaff();
  const { filters, query, setFilters, clearFilters, hasActiveFilters } =
    useAssetListParams(user?.id ?? '');

  const assetsQuery = useAssetList(query);
  // Read-only, active-only type list, used by the staff-only filter panel
  // below. `GET /asset-types` is open to any authenticated user (there is
  // nothing sensitive in it), so this is fetched unconditionally rather than
  // gated on role.
  const assetTypesQuery = useAssetTypes();

  const assets = assetsQuery.data?.data ?? [];
  const total = assetsQuery.data?.total ?? 0;

  return (
    <section className="flex flex-col gap-6">
      <PageHeading
        actions={
          isStaff ? (
            <Link to="/assets/new" className={PRIMARY_LINK_CLASSES}>
              New asset
            </Link>
          ) : undefined
        }
      >
        {isStaff ? 'Assets' : 'My assets'}
      </PageHeading>

      {/*
        Staff only (D3): the backend already row-scopes an Employee to the
        handful of items assigned to them, so there is nothing left for
        filters to narrow.
      */}
      {isStaff ? (
        <AssetFilters
          filters={filters}
          assetTypes={assetTypesQuery.data ?? []}
          hasActiveFilters={hasActiveFilters}
          onChange={setFilters}
          onClear={clearFilters}
        />
      ) : null}

      {assetsQuery.isPending ? (
        <>
          <p role="status" className="text-sm text-slate-600">
            Loading assets…
          </p>
          <SkeletonRows />
        </>
      ) : null}

      {assetsQuery.isError ? (
        <ErrorState
          title="Could not load assets"
          messages={toApiError(assetsQuery.error).messages}
          onRetry={() => void assetsQuery.refetch()}
        />
      ) : null}

      {assetsQuery.isSuccess && assets.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title="No assets match these filters"
            description="Try widening or clearing the filters above."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={isStaff ? 'No assets yet' : 'No equipment assigned'}
            description={
              isStaff
                ? 'Nothing has been added to inventory yet.'
                : 'No equipment is currently assigned to you.'
            }
          />
        )
      ) : null}

      {assetsQuery.isSuccess && assets.length > 0 ? (
        <>
          <AssetTable assets={assets} />
          <Pagination
            total={total}
            limit={PAGE_SIZE}
            offset={filters.offset}
            itemNoun="assets"
            onOffsetChange={(offset) => setFilters({ offset })}
          />
        </>
      ) : null}
    </section>
  );
}
