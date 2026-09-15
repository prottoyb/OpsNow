import { describe, expect, it } from 'vitest';
import { IDS, categories } from '../../mocks/fixtures';
import { buildCategoryTree } from './categoryTree';

describe('buildCategoryTree', () => {
  it('assembles parents and children from the flat API response', () => {
    const { groups, standalone } = buildCategoryTree(categories);

    expect(groups).toHaveLength(1);
    expect(groups[0].parent.name).toBe('Hardware');
    expect(groups[0].children.map((c) => c.name)).toEqual(['Laptop']);
    expect(standalone.map((c) => c.name)).toEqual(['Network', 'Software']);
  });

  it('excludes inactive categories', () => {
    const { groups, standalone } = buildCategoryTree([
      ...categories,
      {
        id: 'c9999999-9999-4999-8999-999999999999',
        name: 'Retired',
        parentId: null,
        isActive: false,
      },
    ]);

    const names = [
      ...standalone.map((c) => c.name),
      ...groups.flatMap((g) => [g.parent.name, ...g.children.map((c) => c.name)]),
    ];
    expect(names).not.toContain('Retired');
  });

  it('promotes an orphan rather than dropping it', () => {
    // A child whose parent is absent (inactive, or nested deeper than the
    // response includes) must still be selectable.
    const { standalone } = buildCategoryTree([
      {
        id: IDS.categoryLaptop,
        name: 'Laptop',
        parentId: 'c0000000-0000-4000-8000-000000000000',
        isActive: true,
      },
    ]);

    expect(standalone.map((c) => c.name)).toEqual(['Laptop']);
  });

  it('returns an empty tree for an empty list', () => {
    expect(buildCategoryTree([])).toEqual({ groups: [], standalone: [] });
  });
});
