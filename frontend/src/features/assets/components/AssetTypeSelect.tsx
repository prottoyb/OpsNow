import { Select } from '../../../components/ui/Select';
import type { AssetType } from '../../../types/api';

export interface AssetTypeSelectProps {
  id: string;
  value: string;
  assetTypes: readonly AssetType[];
  onChange: (assetTypeId: string) => void;
  describedBy?: string;
  disabled?: boolean;
  /** Label for the "no filter" option. Omit for a required field (asset creation). */
  noneLabel?: string;
}

/**
 * A pure, read-only consumer of `GET /asset-types` — there is no asset-type
 * CRUD in this phase, so nothing here offers to create, rename or retire
 * one. The endpoint already returns active types only.
 */
export function AssetTypeSelect({
  id,
  value,
  assetTypes,
  onChange,
  describedBy,
  disabled = false,
  noneLabel,
}: AssetTypeSelectProps) {
  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      {noneLabel ? <option value="">{noneLabel}</option> : null}
      {assetTypes.map((assetType) => (
        <option key={assetType.id} value={assetType.id}>
          {assetType.name}
        </option>
      ))}
    </Select>
  );
}
