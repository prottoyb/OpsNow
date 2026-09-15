import { Select } from '../../../components/ui/Select';
import type { TicketCategory } from '../../../types/api';
import { buildCategoryTree } from '../categoryTree';

export interface CategorySelectProps {
  id: string;
  value: string;
  categories: readonly TicketCategory[];
  onChange: (categoryId: string) => void;
  describedBy?: string;
  disabled?: boolean;
  /**
   * Label for the "no category" option. Omit it entirely once a category is
   * set: `UpdateTicketDto.categoryId` is `@IsOptional() @IsUUID()` with no
   * null allowance and the ValidationPipe runs `forbidNonWhitelisted`, so
   * `categoryId: null` is a 400 — a category can be changed but never
   * cleared. Offering "none" would be offering an action that cannot work.
   */
  noneLabel?: string;
}

export function CategorySelect({
  id,
  value,
  categories,
  onChange,
  describedBy,
  disabled = false,
  noneLabel,
}: CategorySelectProps) {
  const { groups, standalone } = buildCategoryTree(categories);

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      {noneLabel ? <option value="">{noneLabel}</option> : null}
      {standalone.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
      {groups.map(({ parent, children }) => (
        <optgroup key={parent.id} label={parent.name}>
          {/* The parent itself remains a valid choice. */}
          <option value={parent.id}>{parent.name}</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
