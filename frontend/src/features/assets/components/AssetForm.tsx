import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { FormField } from '../../../components/ui/FormField';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import type { AssetType } from '../../../types/api';
import { FIELD_LIMITS } from '../../../types/api';
import { AssetTypeSelect } from './AssetTypeSelect';

export interface AssetFormValues {
  /** Used only in create mode; edit never renders or submits this field. */
  assetTag: string;
  name: string;
  assetTypeId: string;
  serialNumber: string;
  /** YYYY-MM-DD, as produced by a native `<input type="date">`, or ''. */
  purchaseDate: string;
  /** YYYY-MM-DD, as produced by a native `<input type="date">`, or ''. */
  warrantyExpiresAt: string;
  notes: string;
}

export interface AssetFormProps {
  mode: 'create' | 'edit';
  initialValues: AssetFormValues;
  assetTypes: readonly AssetType[];
  submitting: boolean;
  /** Backend validation messages, rendered verbatim. */
  serverMessages: string[];
  submitLabel: string;
  onSubmit: (values: AssetFormValues) => void;
  onCancel?: () => void;
}

type FieldErrors = Partial<
  Record<'assetTag' | 'name' | 'assetTypeId' | 'serialNumber' | 'notes', string>
>;

/**
 * Client-side checks mirror the limits in
 * `backend/src/assets/dto/create-asset.dto.ts` / `update-asset.dto.ts` so the
 * obvious mistakes are caught without a round trip. They are a convenience,
 * never the authority — the backend's ValidationPipe re-validates everything
 * and its messages are surfaced unchanged in `serverMessages`.
 *
 * Deliberately absent: a `status` field. Status is a separate, staff-only
 * control (`AssetStatusControl`) never part of this form — see D5 in the
 * Phase 8b plan. `PATCH /assets/:id` validates `status` whenever the key is
 * present at all, so this form must never send it.
 */
function validate(mode: AssetFormProps['mode'], values: AssetFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const assetTag = values.assetTag.trim();
  const name = values.name.trim();
  const serialNumber = values.serialNumber.trim();
  const notes = values.notes.trim();

  if (mode === 'create') {
    if (assetTag === '') {
      errors.assetTag = 'Enter an asset tag.';
    } else if (assetTag.length > FIELD_LIMITS.assetTag) {
      errors.assetTag = `Keep the asset tag to ${FIELD_LIMITS.assetTag} characters or fewer.`;
    }
  }

  if (name === '') {
    errors.name = 'Enter a name.';
  } else if (name.length > FIELD_LIMITS.assetName) {
    errors.name = `Keep the name to ${FIELD_LIMITS.assetName} characters or fewer.`;
  }

  if (values.assetTypeId === '') {
    errors.assetTypeId = 'Choose an asset type.';
  }

  if (serialNumber.length > FIELD_LIMITS.serialNumber) {
    errors.serialNumber = `Keep the serial number to ${FIELD_LIMITS.serialNumber} characters or fewer.`;
  }

  if (notes.length > FIELD_LIMITS.assetNotes) {
    errors.notes = `Keep the notes to ${FIELD_LIMITS.assetNotes} characters or fewer.`;
  }

  return errors;
}

export function AssetForm({
  mode,
  initialValues,
  assetTypes,
  submitting,
  serverMessages,
  submitLabel,
  onSubmit,
  onCancel,
}: AssetFormProps) {
  const [values, setValues] = useState<AssetFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(mode, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    onSubmit({
      ...values,
      assetTag: values.assetTag.trim(),
      name: values.name.trim(),
      serialNumber: values.serialNumber.trim(),
      notes: values.notes.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {mode === 'create' ? (
        <FormField
          id="asset-tag"
          label="Asset tag"
          required
          error={fieldErrors.assetTag}
          hint={`Up to ${FIELD_LIMITS.assetTag} characters. Cannot be changed after creation.`}
        >
          {({ id, describedBy, required }) => (
            <Input
              id={id}
              name="assetTag"
              required={required}
              value={values.assetTag}
              maxLength={FIELD_LIMITS.assetTag}
              aria-describedby={describedBy}
              aria-invalid={fieldErrors.assetTag ? true : undefined}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  assetTag: event.target.value,
                }))
              }
            />
          )}
        </FormField>
      ) : (
        // assetTag is not editable (see `UpdateAssetInput`) — shown as
        // read-only context, not as a disabled input a user might expect to
        // interact with.
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">Asset tag: </span>
          {initialValues.assetTag}
        </p>
      )}

      <FormField
        id="asset-name"
        label="Name"
        required
        error={fieldErrors.name}
        hint={`Up to ${FIELD_LIMITS.assetName} characters.`}
      >
        {({ id, describedBy, required }) => (
          <Input
            id={id}
            name="name"
            required={required}
            value={values.name}
            maxLength={FIELD_LIMITS.assetName}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.name ? true : undefined}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        )}
      </FormField>

      <FormField
        id="asset-type"
        label="Asset type"
        required
        error={fieldErrors.assetTypeId}
      >
        {({ id, describedBy }) => (
          <AssetTypeSelect
            id={id}
            value={values.assetTypeId}
            assetTypes={assetTypes}
            describedBy={describedBy}
            noneLabel="Choose a type"
            onChange={(assetTypeId) =>
              setValues((current) => ({ ...current, assetTypeId }))
            }
          />
        )}
      </FormField>

      <FormField
        id="asset-serial-number"
        label="Serial number"
        error={fieldErrors.serialNumber}
        hint={`Up to ${FIELD_LIMITS.serialNumber} characters. Optional.`}
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="serialNumber"
            value={values.serialNumber}
            maxLength={FIELD_LIMITS.serialNumber}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.serialNumber ? true : undefined}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                serialNumber: event.target.value,
              }))
            }
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="asset-purchase-date" label="Purchase date">
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="purchaseDate"
              type="date"
              value={values.purchaseDate}
              aria-describedby={describedBy}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  purchaseDate: event.target.value,
                }))
              }
            />
          )}
        </FormField>

        <FormField id="asset-warranty-expires" label="Warranty expires">
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="warrantyExpiresAt"
              type="date"
              value={values.warrantyExpiresAt}
              aria-describedby={describedBy}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  warrantyExpiresAt: event.target.value,
                }))
              }
            />
          )}
        </FormField>
      </div>

      <FormField
        id="asset-notes"
        label="Notes"
        error={fieldErrors.notes}
        hint={`Up to ${FIELD_LIMITS.assetNotes} characters. Optional.`}
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            name="notes"
            value={values.notes}
            maxLength={FIELD_LIMITS.assetNotes}
            aria-describedby={describedBy}
            aria-invalid={fieldErrors.notes ? true : undefined}
            onChange={(event) =>
              setValues((current) => ({ ...current, notes: event.target.value }))
            }
          />
        )}
      </FormField>

      <div aria-live="assertive">
        {serverMessages.length > 0 ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-900">
              The asset could not be saved
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm text-red-900">
              {serverMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
