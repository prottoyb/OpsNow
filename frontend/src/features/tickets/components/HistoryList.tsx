import { CARD_SURFACE_CLASSES } from '../../../components/ui/Card';
import { formatDateTime, fullName, toDateTimeAttribute } from '../../../lib/format';
import type { TicketHistoryEntry } from '../../../types/api';

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  subject: 'Subject',
  description: 'Description',
  categoryId: 'Category',
  assigneeId: 'Assignee',
  reopened_count: 'Reopen count',
};

function fieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName] ?? fieldName;
}

function valueLabel(value: string | null): string {
  return value === null || value === '' ? '—' : value;
}

/** Staff-only view; the backend rejects an Employee's request with 403. */
export function HistoryList({
  entries,
}: {
  entries: readonly TicketHistoryEntry[];
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-600">No history recorded yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className={`${CARD_SURFACE_CLASSES} text-sm`}>
          <p className="text-slate-900">
            <span className="font-medium">{fieldLabel(entry.fieldName)}</span>{' '}
            changed from{' '}
            <span className="user-content">{valueLabel(entry.oldValue)}</span>{' '}
            to <span className="user-content">{valueLabel(entry.newValue)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {entry.actor ? fullName(entry.actor) : 'System'} ·{' '}
            <time dateTime={toDateTimeAttribute(entry.createdAt)}>
              {formatDateTime(entry.createdAt)}
            </time>
          </p>
        </li>
      ))}
    </ol>
  );
}
