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
 * Every active category is emitted exactly once, whatever its depth. Only the
 * first level of nesting is rendered as a group; anything deeper (or whose
 * parent is inactive, and therefore absent from this list) is promoted to the
 * top level rather than dropped. That matters because the schema puts no depth
 * limit on the category self-relation and the backend's `findActiveById()`
 * accepts any active node, so a category this function failed to emit would be
 * a legitimate choice the user simply could not make.
 */
export function buildCategoryTree(
  categories: readonly TicketCategory[],
): CategoryTree {
  const active = categories.filter((category) => category.isActive);
  const byId = new Map(active.map((category) => [category.id, category]));

  // Roots: no parent, or a parent that is not itself an active category.
  const isRoot = (category: TicketCategory): boolean =>
    !category.parentId || !byId.has(category.parentId);
  const rootIds = new Set(active.filter(isRoot).map((category) => category.id));

  const childrenByParent = new Map<string, TicketCategory[]>();
  const topLevel: TicketCategory[] = [];

  for (const category of active) {
    // Grouped only when the parent is a root, which keeps the rendered
    // structure to the single level <optgroup> supports. Anything deeper is
    // promoted to the top level instead of being bucketed under a parent that
    // is never rendered — that is how a grandchild used to disappear.
    if (category.parentId && rootIds.has(category.parentId)) {
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
