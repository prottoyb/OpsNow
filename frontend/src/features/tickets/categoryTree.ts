import type { TicketCategory } from '../../types/api';

export interface CategoryGroup {
  parent: TicketCategory;
  children: TicketCategory[];
}

export interface CategoryTree {
  /** Top-level categories that have children, rendered as <optgroup>. */
  groups: CategoryGroup[];
  /** Top-level categories with no children, rendered as plain <option>. */
  standalone: TicketCategory[];
}

/**
 * `GET /ticket-categories` returns a FLAT list ordered by name, so the
 * parent/child structure has to be reassembled here from `parentId`.
 *
 * Parent nodes stay selectable: the backend's `findActiveById()` accepts any
 * active category, parent or leaf, so rendering a parent as a non-selectable
 * <optgroup> label alone would hide a legitimate choice. Each group therefore
 * repeats its parent as a selectable option inside itself.
 *
 * A child whose parent is missing from the list (inactive parent, deeper
 * nesting) is not dropped — it is promoted to the top level so a category can
 * never silently disappear from the picker.
 */
export function buildCategoryTree(
  categories: readonly TicketCategory[],
): CategoryTree {
  const active = categories.filter((category) => category.isActive);
  const byId = new Map(active.map((category) => [category.id, category]));

  const childrenByParent = new Map<string, TicketCategory[]>();
  const topLevel: TicketCategory[] = [];

  for (const category of active) {
    if (category.parentId && byId.has(category.parentId)) {
      const siblings = childrenByParent.get(category.parentId) ?? [];
      siblings.push(category);
      childrenByParent.set(category.parentId, siblings);
    } else {
      topLevel.push(category);
    }
  }

  const groups: CategoryGroup[] = [];
  const standalone: TicketCategory[] = [];

  for (const parent of topLevel) {
    const children = childrenByParent.get(parent.id);
    if (children && children.length > 0) {
      groups.push({ parent, children });
    } else {
      standalone.push(parent);
    }
  }

  return { groups, standalone };
}
