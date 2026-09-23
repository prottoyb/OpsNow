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
    <details className="group">
      <summary className="[&::-webkit-details-marker]:hidden marker:hidden inline-flex cursor-pointer items-center gap-1 rounded-sm border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
        {/* Both `marker:hidden` (the standards `::marker` a <summary> gets)
            and the `[&::-webkit-details-marker]:hidden` arbitrary variant
            (older WebKit's own pseudo-element) remove the native disclosure
            triangle, replaced by this glyph so open/closed state stays
            visible without looking like a bare underlined link in a data
            cell. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3 transition-transform group-open:rotate-90"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
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

const TH = 'px-3 py-2.5';
const TD = 'px-3 py-3 align-top';
/**
 * Entity is the one column a narrow phone screen can least afford: every
 * other column is either short (Time, Outcome), already wraps (Actor,
 * Details), or is the reason someone opened the log at all (Action).
 * Deliberately a simplification, not a recovery path: entity type/id is not
 * duplicated into "View details" (which covers IP/user agent/metadata only),
 * so this genuinely narrows what a phone-width viewport can see, in exchange
 * for not forcing horizontal scroll on every row. Widening the viewport — or
 * resizing —
 * is what recovers the column.
 */
const ENTITY_CELL = 'hidden sm:table-cell';

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
    <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Audit log, newest first</caption>
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <th scope="col" className={TH}>
              Time
            </th>
            <th scope="col" className={TH}>
              Action
            </th>
            <th scope="col" className={TH}>
              Actor
            </th>
            <th scope="col" className={`${TH} ${ENTITY_CELL}`}>
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
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
            >
              <td className={`${TD} whitespace-nowrap text-slate-600`}>
                <time dateTime={toDateTimeAttribute(entry.createdAt)}>
                  {formatDateTime(entry.createdAt)}
                </time>
              </td>
              <td className={TD}>
                {/* A plain span, not `<code>` — the `<code>` element itself
                    was the single biggest "raw database dump" signal (per
                    the designer's rendered-UI review), independent of any
                    styling; a smaller mono weight keeps the dotted action
                    key legible as a system identifier without that
                    connotation. */}
                <span className="font-mono text-xs break-all text-slate-700">
                  {entry.action}
                </span>
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
              <td className={`${TD} ${ENTITY_CELL}`}>
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
