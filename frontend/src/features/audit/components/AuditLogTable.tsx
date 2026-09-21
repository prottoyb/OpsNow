import { Badge } from '../../../components/ui/Badge';
import type { BadgeTone } from '../../../components/ui/Badge';
import {
  formatDateTime,
  fullName,
  toDateTimeAttribute,
} from '../../../lib/format';
import type { AuditLogEntry } from '../../../types/api';

/** What a missing value reads as, so a null is never a blank cell. */
export const NOT_RECORDED = 'Not recorded';
/**
 * A null actor is not always an anonymous caller: it is also a user who has
 * since been deleted (`ON DELETE SET NULL`) and a `refresh_failed` row, so the
 * label says only that no actor is recorded, never that the caller was
 * unauthenticated.
 */
export const NOT_ATTRIBUTED = 'Not attributed';

const OUTCOME_TONES: Record<string, BadgeTone> = {
  success: 'success',
  failure: 'danger',
  denied: 'warning',
};

/**
 * Every value is rendered as a React text node. Metadata carries
 * attacker-influenced strings (a submitted login identifier), so nothing here
 * is ever interpreted as markup. Non-strings are shown as JSON text.
 */
function formatMetadataValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unrenderable value]';
  }
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (outcome === null) {
    return <span className="text-slate-600">{NOT_RECORDED}</span>;
  }
  return <Badge tone={OUTCOME_TONES[outcome] ?? 'neutral'}>{outcome}</Badge>;
}

function Recorded({ value }: { value: string | null }) {
  return value === null ? (
    <span className="text-slate-600">{NOT_RECORDED}</span>
  ) : (
    <span className="break-all">{value}</span>
  );
}

/**
 * Long metadata is inspected in a native `<details>` so it never widens the
 * row: values wrap (`break-words`) and the block scrolls past a fixed height.
 * A `<details>` is keyboard-operable and announced correctly out of the box.
 */
function EntryDetails({ entry }: { entry: AuditLogEntry }) {
  const metadata = Object.entries(entry.metadata);
  return (
    <details>
      <summary className="cursor-pointer rounded-sm text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
        View details
        <span className="sr-only"> for {entry.action}</span>
      </summary>
      <dl className="mt-2 max-h-64 max-w-md overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="mb-2">
          <dt className="font-semibold text-slate-700">IP address</dt>
          <dd>
            <Recorded value={entry.ipAddress} />
          </dd>
        </div>
        <div className="mb-2">
          <dt className="font-semibold text-slate-700">User agent</dt>
          <dd className="break-words">
            <Recorded value={entry.userAgent} />
          </dd>
        </div>
        {metadata.length === 0 ? (
          <div>
            <dt className="font-semibold text-slate-700">Metadata</dt>
            <dd className="text-slate-600">None recorded</dd>
          </div>
        ) : (
          metadata.map(([key, value]) => (
            <div key={key} className="mb-2 last:mb-0">
              <dt className="font-semibold text-slate-700">{key}</dt>
              <dd className="break-words whitespace-pre-wrap">
                {formatMetadataValue(value)}
              </dd>
            </div>
          ))
        )}
      </dl>
    </details>
  );
}

const TH = 'px-3 py-2 font-semibold';
const TD = 'px-3 py-2 align-top';

/**
 * Read-only by construction: an audit row is append-only, so this renders no
 * edit, delete or row action of any kind.
 */
export function AuditLogTable({
  entries,
}: {
  entries: readonly AuditLogEntry[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Audit log, newest first</caption>
        <thead>
          <tr className="border-b border-slate-300 text-slate-700">
            <th scope="col" className={TH}>
              Time
            </th>
            <th scope="col" className={TH}>
              Action
            </th>
            <th scope="col" className={TH}>
              Actor
            </th>
            <th scope="col" className={TH}>
              Entity
            </th>
            <th scope="col" className={TH}>
              Outcome
            </th>
            <th scope="col" className={TH}>
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-slate-200 bg-white">
              <td className={`${TD} whitespace-nowrap`}>
                <time dateTime={toDateTimeAttribute(entry.createdAt)}>
                  {formatDateTime(entry.createdAt)}
                </time>
              </td>
              <td className={TD}>
                <code className="text-xs break-all">{entry.action}</code>
              </td>
              <td className={TD}>
                {entry.actor ? (
                  <>
                    {fullName(entry.actor)}
                    <span className="block text-xs text-slate-600">
                      {entry.actor.role}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-600">{NOT_ATTRIBUTED}</span>
                )}
              </td>
              <td className={TD}>
                {entry.entityType || entry.entityId ? (
                  <>
                    {entry.entityType ?? NOT_RECORDED}
                    {entry.entityId ? (
                      <span className="block max-w-[14rem] text-xs break-all text-slate-600">
                        {entry.entityId}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-slate-600">None</span>
                )}
              </td>
              <td className={TD}>
                <OutcomeBadge outcome={entry.outcome} />
              </td>
              <td className={TD}>
                <EntryDetails entry={entry} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
