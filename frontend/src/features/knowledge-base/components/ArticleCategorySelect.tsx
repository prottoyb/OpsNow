import { useMemo } from 'react';
import { Select } from '../../../components/ui/Select';
import type { KnowledgeBaseCategory } from '../../../types/api';
import { buildCategoryTree } from '../../tickets/categoryTree';

export interface ArticleCategorySelectProps {
  id: string;
  value: string;
  categories: readonly KnowledgeBaseCategory[];
  onChange: (categoryId: string) => void;
  describedBy?: string;
  disabled?: boolean;
  /**
   * Label for the "no category" option.
   *
   * Unlike `CategorySelect`, this one is always offered:
   * `UpdateKnowledgeArticleDto.categoryId` accepts an explicit `null`, which
   * is exactly how an article leaves its category, so "none" is a real
   * choice here rather than an action that cannot work.
   */
  noneLabel: string;
}

/**
 * `GET /kb-categories` and `GET /ticket-categories` return the same flat
 * id/name/parentId/isActive contract over two different tables — the backend
 * DTO says so explicitly — so the tree assembly is shared rather than
 * duplicated. Only the option semantics differ, which is what this thin
 * wrapper exists to express.
 */
export function ArticleCategorySelect({
  id,
  value,
  categories,
  onChange,
  describedBy,
  disabled = false,
  noneLabel,
}: ArticleCategorySelectProps) {
  // Memoized: this is rendered inside a form that re-renders on every
  // keystroke, and rebuilding the tree each time is pure waste.
  const { groups, standalone } = useMemo(
    () => buildCategoryTree(categories),
    [categories],
  );

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{noneLabel}</option>
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
