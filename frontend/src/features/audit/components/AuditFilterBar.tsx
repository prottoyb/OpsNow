import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_OUTCOMES,
} from '../../../types/api';
import { todayUtcDay } from '../../analytics/analyticsRange';
import { isUuid } from '../useAuditParams';
import type { AuditFilters } from '../useAuditParams';

export interface AuditFilterBarProps {
  filters: AuditFilters;
  rangeError: string | null;
  hasActiveFilters: boolean;
  onChange: (next: Partial<AuditFilters>) => void;
  onClear: () => void;
}

const RANGE_ERROR_ID = 'audit-range-error';
const LABEL_CLASSES = 'text-sm font-medium text-slate-900';

interface UuidFilterProps {
  id: string;
  label: string;
  /** The committed (URL) value. */
  value: string | undefined;
  onCommit: (value: string | undefined) => void;
}

/**
 * A free-text UUID box that only commits to the URL when it holds a complete,
 * well-formed UUID (or is emptied). While the draft is partial it says so
 * instead of sending a request the backend would reject with a 400. Keyed by
 * the committed value in the parent, so Clear filters and Back/Forward reset
 * the draft.
 */
function UuidFilter({ id, label, value, onCommit }: UuidFilterProps) {
  const [draft, setDraft] = useState(value ?? '');
  const trimmed = draft.trim();
  const invalid = trimmed !== '' && !isUuid(trimmed);
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
      </label>
      <Input
        id={id}
        type="text"
        value={draft}
        maxLength={36}
        spellCheck={false}
        autoComplete="off"
        placeholder="00000000-0000-0000-0000-000000000000"
        aria-invalid={invalid}
        aria-describedby={invalid ? hintId : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const candidate = next.trim();
          if (candidate === '') onCommit(undefined);
          else if (isUuid(candidate)) onCommit(candidate.toLowerCase());
        }}
      />
      {invalid ? (
        <p id={hintId} className="text-xs text-amber-900">
          Enter a complete ID (36 characters). The filter applies once it is
          valid.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Every control commits straight to the URL, so a filtered view is linkable.
 * The action, entity type and outcome lists are the backend's closed sets.
 * Dates are UTC days, both included.
 */
export function AuditFilterBar({
  filters,
  rangeError,
  hasActiveFilters,
  onChange,
  onClear,
}: AuditFilterBarProps) {
  const today = todayUtcDay();
  return (
    <section
      aria-labelledby="audit-filters-heading"
      className="rounded-md border border-slate-200 bg-white p-4"
    >
      <h2 id="audit-filters-heading" className="sr-only">
        Filter audit log
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-filter-action" className={LABEL_CLASSES}>
            Action
          </label>
          <Select
            id="audit-filter-action"
            value={filters.action ?? ''}
            onChange={(event) =>
              onChange({
                action: (event.target.value ||
                  undefined) as AuditFilters['action'],
              })
            }
          >
            <option value="">Any action</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="audit-filter-outcome" className={LABEL_CLASSES}>
            Outcome
          </label>
          <Select
            id="audit-filter-outcome"
            value={filters.outcome ?? ''}
            onChange={(event) =>
              onChange({
                outcome: (event.target.value ||
                  undefined) as AuditFilters['outcome'],
              })
            }
          >
            <option value="">Any outcome</option>
            {AUDIT_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcome}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="audit-filter-entity-type" className={LABEL_CLASSES}>
            Entity type
          </label>
          <Select
            id="audit-filter-entity-type"
            value={filters.entityType ?? ''}
            onChange={(event) =>
              onChange({
                entityType: (event.target.value ||
                  undefined) as AuditFilters['entityType'],
              })
            }
          >
            <option value="">Any entity type</option>
            {AUDIT_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        <UuidFilter
          key={`entity-${filters.entityId ?? ''}`}
          id="audit-filter-entity-id"
          label="Entity ID"
          value={filters.entityId}
          onCommit={(entityId) => onChange({ entityId })}
        />

        <UuidFilter
          key={`actor-${filters.actorId ?? ''}`}
          id="audit-filter-actor"
          label="Actor ID"
          value={filters.actorId}
          onCommit={(actorId) => onChange({ actorId })}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="audit-filter-from" className={LABEL_CLASSES}>
            From
          </label>
          <Input
            id="audit-filter-from"
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? today}
            aria-invalid={rangeError !== null}
            aria-describedby={rangeError ? RANGE_ERROR_ID : undefined}
            onChange={(event) =>
              onChange({ from: event.target.value || undefined })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="audit-filter-to" className={LABEL_CLASSES}>
            To
          </label>
          <Input
            id="audit-filter-to"
            type="date"
            value={filters.to ?? ''}
            min={filters.from}
            max={today}
            aria-invalid={rangeError !== null}
            aria-describedby={rangeError ? RANGE_ERROR_ID : undefined}
            onChange={(event) =>
              onChange({ to: event.target.value || undefined })
            }
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Dates are UTC days, both included. Actor and entity are matched by
        exact ID.
      </p>

      {rangeError ? (
        <p
          id={RANGE_ERROR_ID}
          role="alert"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {rangeError}
        </p>
      ) : null}

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
