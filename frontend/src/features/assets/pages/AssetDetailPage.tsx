import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { ErrorState, InlineNotice } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { FullPageSpinner, Spinner } from '../../../components/ui/Spinner';
import { Tabs } from '../../../components/ui/Tabs';
import { toApiError } from '../../../lib/api/errors';
import {
  formatDateTime,
  fullName,
  toDateInputValue,
  toDateTimeAttribute,
} from '../../../lib/format';
import type { Asset, AssetStatus, UpdateAssetInput } from '../../../types/api';
import { useAuth, useIsStaff } from '../../auth/useAuth';
import { AssetAssignmentControl } from '../components/AssetAssignmentControl';
import { AssetForm } from '../components/AssetForm';
import type { AssetFormValues } from '../components/AssetForm';
import { AssetStatusBadge } from '../components/AssetStatusBadge';
import { assetStatusLabel } from '../assetStatus';
import { AssetStatusControl } from '../components/AssetStatusControl';
import { AssignmentHistoryList } from '../components/AssignmentHistoryList';
import {
  useAsset,
  useAssetAssignments,
  useAssetTypes,
  useRefetchAsset,
  useUpdateAsset,
  useUpdateAssetAssignment,
} from '../useAssets';

interface Notice {
  tone: 'warning' | 'success';
  text: string;
}

const CONFLICT_TEXT =
  'Someone else changed this asset while you were working on it. The latest version has been reloaded — please review it and try again.';

/**
 * Returns `undefined` when `formValue` matches `current` (nothing to send),
 * `null` when the field was cleared, or the trimmed value otherwise. Mirrors
 * `UpdateAssetInput`'s "explicit null clears, omitted key leaves unchanged"
 * contract.
 */
function diffOptionalString(
  current: string | null,
  formValue: string,
): string | null | undefined {
  const currentValue = current ?? '';
  if (formValue === currentValue) return undefined;
  return formValue === '' ? null : formValue;
}

/** Same contract as `diffOptionalString`, but compares date-only values. */
function diffOptionalDate(
  currentIso: string | null,
  formValue: string,
): string | null | undefined {
  const currentValue = toDateInputValue(currentIso);
  if (formValue === currentValue) return undefined;
  return formValue === '' ? null : formValue;
}

export function AssetDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isStaff = useIsStaff();

  const assetQuery = useAsset(id);
  // Not requested at all for an Employee: the endpoint is staff-only and
  // would only ever answer 403 (D2).
  const assignmentsQuery = useAssetAssignments(id, isStaff);
  const assetTypesQuery = useAssetTypes();
  const refetchAsset = useRefetchAsset(id);

  // Two separate mutation instances over the same `PATCH /assets/:id`
  // endpoint — there is no dedicated status endpoint on this resource — so
  // the edit form's "Saving…" state and the status control's "Saving…"
  // state never bleed into each other.
  const updateAsset = useUpdateAsset(id);
  const updateStatus = useUpdateAsset(id);
  const updateAssignment = useUpdateAssetAssignment(id);

  const [activeTab, setActiveTab] = useState('history');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editMessages, setEditMessages] = useState<string[]>([]);
  const [assignmentMessages, setAssignmentMessages] = useState<string[]>([]);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);

  /** See `TicketDetailPage.closeEditForm` for the full rationale. */
  function closeEditForm() {
    setEditing(false);
    setEditMessages([]);
  }

  function handleMutationError(
    error: unknown,
    setMessages?: (m: string[]) => void,
  ) {
    const apiError = toApiError(error);

    if (apiError.isConflict) {
      setNotice({ tone: 'warning', text: CONFLICT_TEXT });
      closeEditForm();
      refetchAsset();
      return;
    }
    if (apiError.isForbidden) {
      setNotice({ tone: 'warning', text: apiError.messages[0] });
      closeEditForm();
      refetchAsset();
      return;
    }
    if (setMessages) {
      setMessages(apiError.messages);
      return;
    }
    setNotice({ tone: 'warning', text: apiError.messages[0] });
  }

  if (assetQuery.isPending) {
    return <FullPageSpinner label="Loading asset" />;
  }

  if (assetQuery.isError) {
    return renderLoadError(assetQuery.error, () => void assetQuery.refetch());
  }

  const asset = assetQuery.data;

  function handleEditSubmit(values: AssetFormValues) {
    setEditMessages([]);

    // Minimal diff only — `forbidNonWhitelisted` turns any extra property
    // into a 400, and `status` is never included here (owned entirely by
    // `AssetStatusControl` below; see D5).
    const input: UpdateAssetInput = {};
    if (values.name !== asset.name) input.name = values.name;
    if (
      values.assetTypeId !== '' &&
      values.assetTypeId !== asset.assetType.id
    ) {
      input.assetTypeId = values.assetTypeId;
    }
    const serialNumber = diffOptionalString(asset.serialNumber, values.serialNumber);
    if (serialNumber !== undefined) input.serialNumber = serialNumber;
    const purchaseDate = diffOptionalDate(asset.purchaseDate, values.purchaseDate);
    if (purchaseDate !== undefined) input.purchaseDate = purchaseDate;
    const warrantyExpiresAt = diffOptionalDate(
      asset.warrantyExpiresAt,
      values.warrantyExpiresAt,
    );
    if (warrantyExpiresAt !== undefined) {
      input.warrantyExpiresAt = warrantyExpiresAt;
    }
    const notes = diffOptionalString(asset.notes, values.notes);
    if (notes !== undefined) input.notes = notes;

    if (Object.keys(input).length === 0) {
      setEditing(false);
      return;
    }

    updateAsset.mutate(input, {
      onSuccess: () => {
        setEditing(false);
        setNotice({ tone: 'success', text: 'Asset updated.' });
      },
      onError: (error) => handleMutationError(error, setEditMessages),
    });
  }

  function handleStatusChange(status: AssetStatus) {
    setNotice(null);
    setStatusMessages([]);
    updateStatus.mutate(
      { status },
      {
        onSuccess: (updated) =>
          setNotice({
            tone: 'success',
            text: `Status changed to ${assetStatusLabel(updated.status)}.`,
          }),
        onError: (error) => handleMutationError(error, setStatusMessages),
      },
    );
  }

  function handleAssignmentChange(input: { assignedToId: string | null; notes?: string }) {
    setNotice(null);
    setAssignmentMessages([]);
    updateAssignment.mutate(input, {
      onSuccess: () =>
        setNotice({
          tone: 'success',
          text: input.assignedToId
            ? 'Asset assigned to you.'
            : 'Asset returned to stock.',
        }),
      onError: (error) => handleMutationError(error, setAssignmentMessages),
    });
  }

  const historyPanel = (
    <div className="flex flex-col gap-4">
      {assignmentsQuery.isPending ? <Spinner label="Loading history" /> : null}
      {assignmentsQuery.isError ? (
        <ErrorState
          title="Could not load history"
          messages={toApiError(assignmentsQuery.error).messages}
          onRetry={() => void assignmentsQuery.refetch()}
        />
      ) : null}
      {assignmentsQuery.isSuccess ? (
        <AssignmentHistoryList assignments={assignmentsQuery.data.data} />
      ) : null}
    </div>
  );

  // The History tab exists for staff only — mirrors `TicketDetailPage`.
  const tabs = isStaff
    ? [{ id: 'history', label: 'History', panel: historyPanel }]
    : [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeading>
        {asset.assetTag} — {asset.name}
      </PageHeading>

      <div className="flex flex-wrap items-center gap-2">
        <AssetStatusBadge status={asset.status} />
        <span className="text-sm text-slate-600">{asset.assetType.name}</span>
      </div>

      {/*
        Rendered unconditionally and the notice swapped inside it — see
        `TicketDetailPage` for why a live region inserted with its text
        already present is not reliably announced.
      */}
      <div aria-live="polite" aria-atomic="true">
        {notice ? (
          <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <article className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">Details</h2>
            {editing && isStaff ? (
              <div className="mt-3">
                <AssetForm
                  mode="edit"
                  initialValues={{
                    assetTag: asset.assetTag,
                    name: asset.name,
                    assetTypeId: asset.assetType.id,
                    serialNumber: asset.serialNumber ?? '',
                    purchaseDate: toDateInputValue(asset.purchaseDate),
                    warrantyExpiresAt: toDateInputValue(asset.warrantyExpiresAt),
                    notes: asset.notes ?? '',
                  }}
                  assetTypes={assetTypesQuery.data ?? []}
                  submitting={updateAsset.isPending}
                  serverMessages={editMessages}
                  submitLabel="Save changes"
                  onSubmit={handleEditSubmit}
                  onCancel={closeEditForm}
                />
              </div>
            ) : (
              <>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="font-medium text-slate-700">Name</dt>
                  <dd className="text-slate-800">{asset.name}</dd>
                  <dt className="font-medium text-slate-700">Serial number</dt>
                  <dd className="text-slate-800">
                    {asset.serialNumber ?? 'Not recorded'}
                  </dd>
                  {asset.notes ? (
                    <>
                      <dt className="font-medium text-slate-700">Notes</dt>
                      <dd className="user-content text-slate-800">
                        {asset.notes}
                      </dd>
                    </>
                  ) : null}
                </dl>
                {isStaff ? (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(true)}
                    >
                      Edit details
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </article>

          {tabs.length > 0 ? (
            <Tabs
              tabs={tabs}
              activeId={activeTab}
              onChange={setActiveTab}
              label="Asset activity"
            />
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold text-slate-900">
              Assignment
            </h2>
            <div className="mt-3">
              {isStaff ? (
                <AssetAssignmentControl
                  status={asset.status}
                  currentAssignee={asset.currentAssignee}
                  currentUserId={user?.id ?? ''}
                  submitting={updateAssignment.isPending}
                  serverMessages={assignmentMessages}
                  onAssign={handleAssignmentChange}
                />
              ) : (
                // `PATCH /assets/:id/assignment` is staff-only; an Employee
                // (viewing an asset currently assigned to them) gets a
                // read-only view rather than buttons the backend would 403.
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Assigned to: </span>
                  {asset.currentAssignee
                    ? fullName(asset.currentAssignee)
                    : 'Unassigned'}
                </p>
              )}
            </div>
          </section>

          {isStaff ? (
            <section className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-900">
                Status
              </h2>
              <div className="mt-3">
                <AssetStatusControl
                  status={asset.status}
                  hasAssignee={asset.currentAssignee !== null}
                  submitting={updateStatus.isPending}
                  serverMessages={statusMessages}
                  onChange={handleStatusChange}
                />
              </div>
            </section>
          ) : null}

          <AssetMetadata asset={asset} />
        </aside>
      </div>
    </section>
  );
}

function AssetMetadata({ asset }: { asset: Asset }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Metadata</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium text-slate-700">Asset tag</dt>
        <dd className="text-slate-800">{asset.assetTag}</dd>
        <dt className="font-medium text-slate-700">Type</dt>
        <dd className="text-slate-800">{asset.assetType.name}</dd>
        {asset.purchaseDate ? (
          <>
            <dt className="font-medium text-slate-700">Purchased</dt>
            <dd className="text-slate-800">
              <time dateTime={toDateTimeAttribute(asset.purchaseDate)}>
                {formatDateTime(asset.purchaseDate)}
              </time>
            </dd>
          </>
        ) : null}
        {asset.warrantyExpiresAt ? (
          <>
            <dt className="font-medium text-slate-700">Warranty expires</dt>
            <dd className="text-slate-800">
              <time dateTime={toDateTimeAttribute(asset.warrantyExpiresAt)}>
                {formatDateTime(asset.warrantyExpiresAt)}
              </time>
            </dd>
          </>
        ) : null}
        <dt className="font-medium text-slate-700">Created</dt>
        <dd className="text-slate-800">
          <time dateTime={toDateTimeAttribute(asset.createdAt)}>
            {formatDateTime(asset.createdAt)}
          </time>
        </dd>
        <dt className="font-medium text-slate-700">Updated</dt>
        <dd className="text-slate-800">
          <time dateTime={toDateTimeAttribute(asset.updatedAt)}>
            {formatDateTime(asset.updatedAt)}
          </time>
        </dd>
      </dl>
    </section>
  );
}

function renderLoadError(error: unknown, retry: () => void) {
  const apiError = toApiError(error);

  /*
   * 404 copy must never hint that the asset might exist but be out of scope
   * (e.g. assigned to someone else) — mirrors ADR-019's rationale for
   * tickets: the backend returns 404 rather than 403 for an out-of-scope
   * asset precisely so an Employee cannot confirm it exists at all.
   */
  if (apiError.isNotFound) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeading>Asset not found</PageHeading>
        <p className="text-sm text-slate-600">
          We could not find that asset.
        </p>
        <Link
          to="/assets"
          className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Back to assets
        </Link>
      </section>
    );
  }

  // `ParseUUIDPipe` runs before the handler, so a malformed id is a 400, not
  // a 404 — the same "no such asset" outcome needs its own branch.
  if (apiError.isValidationError) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeading>Invalid asset reference</PageHeading>
        <p className="text-sm text-slate-600">
          That asset reference is not valid.
        </p>
        <Link
          to="/assets"
          className="text-sm font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Back to assets
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <PageHeading>Asset</PageHeading>
      <ErrorState
        title="Could not load this asset"
        messages={apiError.messages}
        onRetry={retry}
      />
    </section>
  );
}
