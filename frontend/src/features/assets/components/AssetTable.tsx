import { Link } from 'react-router-dom';
import { fullName } from '../../../lib/format';
import type { Asset } from '../../../types/api';
import { AssetStatusBadge } from './AssetStatusBadge';

const LINK_CLASSES =
  'font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

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
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Assets</caption>
          <thead>
            <tr className="border-b border-slate-300 text-slate-700">
              <th scope="col" className="px-3 py-2 font-semibold">
                Asset tag
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Name
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Type
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Status
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Assigned to
              </th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-b border-slate-200 align-top">
                <td className="px-3 py-2">
                  <Link to={`/assets/${asset.id}`} className={LINK_CLASSES}>
                    {asset.assetTag}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-800">{asset.name}</td>
                <td className="px-3 py-2 text-slate-700">
                  {asset.assetType.name}
                </td>
                <td className="px-3 py-2">
                  <AssetStatusBadge status={asset.status} />
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {assigneeLabel(asset)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className="rounded-md border border-slate-200 bg-white p-4"
          >
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
