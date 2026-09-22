import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import type { CreateAssetInput } from '../../../types/api';
import { AssetForm } from '../components/AssetForm';
import type { AssetFormValues } from '../components/AssetForm';
import { useAssetTypes, useCreateAsset } from '../useAssets';

export function AssetCreatePage() {
  const navigate = useNavigate();
  const assetTypesQuery = useAssetTypes();
  const createAsset = useCreateAsset();
  const [serverMessages, setServerMessages] = useState<string[]>([]);

  function handleSubmit(values: AssetFormValues) {
    setServerMessages([]);

    // A minimal body: `forbidNonWhitelisted` rejects anything the DTO does
    // not declare, and optional fields are omitted rather than sent empty.
    // `status`/`currentAssigneeId` have no fields on this form at all — a
    // new asset is always created InStock and unassigned (D5).
    const input: CreateAssetInput = {
      assetTag: values.assetTag,
      name: values.name,
      assetTypeId: values.assetTypeId,
    };
    if (values.serialNumber !== '') input.serialNumber = values.serialNumber;
    if (values.purchaseDate !== '') input.purchaseDate = values.purchaseDate;
    if (values.warrantyExpiresAt !== '') {
      input.warrantyExpiresAt = values.warrantyExpiresAt;
    }
    if (values.notes !== '') input.notes = values.notes;

    createAsset.mutate(input, {
      onSuccess: (asset) => navigate(`/assets/${asset.id}`),
      onError: (error) => setServerMessages(toApiError(error).messages),
    });
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <PageHeading>New asset</PageHeading>

      {assetTypesQuery.isPending ? <Spinner label="Loading asset types" /> : null}

      {assetTypesQuery.isError ? (
        <ErrorState
          title="Could not load asset types"
          messages={toApiError(assetTypesQuery.error).messages}
          onRetry={() => void assetTypesQuery.refetch()}
        />
      ) : null}

      {assetTypesQuery.isSuccess ? (
        <Card>
          <AssetForm
            mode="create"
            initialValues={{
              assetTag: '',
              name: '',
              assetTypeId: '',
              serialNumber: '',
              purchaseDate: '',
              warrantyExpiresAt: '',
              notes: '',
            }}
            assetTypes={assetTypesQuery.data}
            submitting={createAsset.isPending}
            serverMessages={serverMessages}
            submitLabel="Create asset"
            onSubmit={handleSubmit}
            onCancel={() => navigate('/assets')}
          />
        </Card>
      ) : null}
    </section>
  );
}
