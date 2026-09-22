import { Link } from 'react-router-dom';
import { CARD_SURFACE_CLASSES } from '../../../components/ui/Card';
import { fullName } from '../../../lib/format';
import type { Asset } from '../../../types/api';
import { AssetStatusBadge } from './AssetStatusBadge';

const LINK_CLASSES =
  'font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

function assigneeLabel(asset: Asset): string {
  return asset.currentAssignee ? fullName(asset.currentAssignee) : 'Unassigned';
}

/**
 * Two representations of the same rows, switched by CSS — same technique as
 * `TicketTable`. A horizontal-scroll wrapper keeps the table from forcing
 * the page itself to scroll sideways on a narrow viewport.
 */
export function AssetTable({ assets }: { assets: readonly Asset[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Assets</caption>
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
              <th scope="col" className="px-3 py-2.5">
                Asset tag
              </th>
              <th scope="col" className="px-3 py-2.5">
                Name
              </th>
              <th scope="col" className="px-3 py-2.5">
                Type
              </th>
              <th scope="col" className="px-3 py-2.5">
                Status
              </th>
              <th scope="col" className="px-3 py-2.5">
                Assigned to
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.map((asset) => (
              <tr
                key={asset.id}
                className="align-top transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
              >
                <td className="px-3 py-3">
                  <Link to={`/assets/${asset.id}`} className={LINK_CLASSES}>
                    {asset.assetTag}
                  </Link>
                </td>
                <td className="px-3 py-3 text-slate-800">{asset.name}</td>
                <td className="px-3 py-3 text-slate-700">
                  {asset.assetType.name}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <AssetStatusBadge status={asset.status} />
                </td>
                <td className="px-3 py-3 text-slate-700">
                  {assigneeLabel(asset)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {assets.map((asset) => (
          <li key={asset.id} className={CARD_SURFACE_CLASSES}>
            <Link to={`/assets/${asset.id}`} className={LINK_CLASSES}>
              {asset.assetTag}
            </Link>
            <p className="text-sm text-slate-800">{asset.name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AssetStatusBadge status={asset.status} />
              <span className="text-xs text-slate-600">
                {asset.assetType.name}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-slate-600">
              <dt className="font-medium">Assigned to</dt>
              <dd>{assigneeLabel(asset)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
