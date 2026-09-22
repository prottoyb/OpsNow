import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import type { TicketCategory, TicketPriority } from '../../../types/api';
import { FIELD_LIMITS, TICKET_PRIORITIES } from '../../../types/api';
import { CategorySelect } from './CategorySelect';

export interface TicketFormValues {
  subject: string;
  description: string;
  categoryId: string;
  priority: TicketPriority;
}

export interface TicketFormProps {
  mode: 'create' | 'edit';
  initialValues: TicketFormValues;
  categories: readonly TicketCategory[];
  submitting: boolean;
  /** Backend validation messages, rendered verbatim. */
  serverMessages: string[];
  submitLabel: string;
  onSubmit: (values: TicketFormValues) => void;
  onCancel?: () => void;
}

type FieldErrors = Partial<Record<'subject' | 'description', string>>;

/**
 * Client-side checks mirror the DTO limits in
 * `backend/src/tickets/dto/create-ticket.dto.ts` so the obvious mistakes are
 * caught without a round trip. They are a convenience, never the authority —
 * the backend's ValidationPipe re-validates everything and its messages are
 * surfaced unchanged in `serverMessages`.
 */
function validate(values: TicketFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const subject = values.subject.trim();
  const description = values.description.trim();

  if (subject === '') {
    errors.subject = 'Enter a subject.';
  } else if (subject.length > FIELD_LIMITS.subject) {
    errors.subject = `Keep the subject to ${FIELD_LIMITS.subject} characters or fewer.`;
  }

  if (description === '') {
    errors.description = 'Describe the problem.';
  } else if (description.length > FIELD_LIMITS.description) {
    errors.description = `Keep the description to ${FIELD_LIMITS.description} characters or fewer.`;
  }

  return errors;
}

export function TicketForm({
  mode,
  initialValues,
  categories,
  submitting,
  serverMessages,
  submitLabel,
  onSubmit,
  onCancel,
}: TicketFormProps) {
  const [values, setValues] = useState<TicketFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    onSubmit({
      ...values,
      subject: values.subject.trim(),
      description: values.description.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        id="ticket-subject"
        label="Subject"
        required
        error={fieldErrors.subject}
        hint={`Up to ${FIELD_LIMITS.subject} characters.`}
      >
        {({ id, describedBy, required }) => (
          <Input
            id={id}
            name="subject"
            required={required}
            value={values.subject}
            maxLength={FIELD_LIMITS.subject}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.subject ? true : undefined}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                subject: event.target.value,
              }))
            }
          />
        )}
      </FormField>

      <FormField
        id="ticket-description"
        label="Description"
        required
        error={fieldErrors.description}
      >
        {({ id, describedBy, required }) => (
          <Textarea
            id={id}
            name="description"
            required={required}
            value={values.description}
            maxLength={FIELD_LIMITS.description}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.description ? true : undefined}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        )}
      </FormField>

      {/*
        A visual break between "what's wrong" (subject/description, above)
        and "how to route it" (category/priority, below) — two conceptually
        different steps that previously ran together as one undifferentiated
        field list.
      */}
      <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
        <FormField
          id="ticket-category"
          label="Category"
          hint={
            mode === 'edit' && initialValues.categoryId !== ''
              ? 'A category can be changed but not removed.'
              : undefined
          }
        >
          {({ id, describedBy }) => (
            <CategorySelect
              id={id}
              value={values.categoryId}
              categories={categories}
              describedBy={describedBy}
              // Offered only while no category is set yet. Once one exists the
              // API cannot clear it (categoryId has no null allowance), so the
              // option is withheld rather than offered and rejected.
              noneLabel={
                mode === 'create' || initialValues.categoryId === ''
                  ? 'No category'
                  : undefined
              }
              onChange={(categoryId) =>
                setValues((current) => ({ ...current, categoryId }))
              }
            />
          )}
        </FormField>

        {/*
          Any role may choose the initial priority on creation. After
          creation it is staff-only and lives on its own endpoint, so it is
          not part of the edit form.
        */}
        {mode === 'create' ? (
          <FormField id="ticket-priority" label="Priority">
            {({ id, describedBy }) => (
              <Select
                id={id}
                value={values.priority}
                aria-describedby={describedBy}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    priority: event.target.value as TicketPriority,
                  }))
                }
              >
                {TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : null}
      </div>

      <div aria-live="assertive">
        {serverMessages.length > 0 ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-900">
              The ticket could not be saved
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
              {serverMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
