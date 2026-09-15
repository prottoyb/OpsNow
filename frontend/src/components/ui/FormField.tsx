import type { ReactNode } from 'react';

export interface FormFieldProps {
  id: string;
  label: string;
  /** Rendered as help text and wired into the control via aria-describedby. */
  hint?: string;
  error?: string;
  required?: boolean;
  children: (control: {
    id: string;
    describedBy: string | undefined;
    required: boolean;
  }) => ReactNode;
}

/**
 * Pairs a real <label> with its control and wires hint/error text through
 * `aria-describedby`, so screen readers announce validation failures with the
 * field rather than as a detached block of text.
 *
 * "Required" is conveyed by the control's own `required` attribute (which
 * maps to `aria-required`), not by appending text to the label. Padding the
 * label would make every field's accessible name read "Password (required)",
 * which is noisier for screen-reader users and makes the name a moving
 * target for anything that looks fields up by label.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-900">
        {label}
        {required ? (
          <span className="ml-1 text-red-700" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      ) : null}
      {children({ id, describedBy, required })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
