import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useAssetListParams } from './useAssetListParams';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_TYPE_ID = '91111111-1111-4111-8111-111111111111';

function wrapper(route: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  };
}

describe('useAssetListParams', () => {
  it('ignores an unrecognised status value in the URL', () => {
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper('/assets?status=NotAStatus'),
    });

    expect(result.current.filters.status).toBeUndefined();
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('ignores a malformed asset-type id in the URL', () => {
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper('/assets?assetType=not-a-uuid'),
    });

    expect(result.current.filters.assetTypeId).toBeUndefined();
    expect(result.current.query.assetTypeId).toBeUndefined();
  });

  it('accepts a well-formed asset-type id', () => {
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper(`/assets?assetType=${VALID_TYPE_ID}`),
    });

    expect(result.current.filters.assetTypeId).toBe(VALID_TYPE_ID);
  });

  it('clamps q to 100 characters', () => {
    const longQuery = 'a'.repeat(150);
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper(`/assets?q=${longQuery}`),
    });

    expect(result.current.filters.q).toHaveLength(100);
  });

  it('ignores an absurd offset rather than forwarding it', () => {
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper('/assets?offset=99999999999999999999'),
    });

    expect(result.current.filters.offset).toBe(0);
  });

  it('snaps an offset that is not on a page boundary', () => {
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper('/assets?offset=25'),
    });

    // PAGE_SIZE is 20, so offset 25 snaps down to 20.
    expect(result.current.filters.offset).toBe(20);
  });

  it('maps the "assigned to me" filter to the current user id in the query', () => {
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper('/assets?assignee=me'),
    });

    expect(result.current.filters.assignee).toBe('me');
    expect(result.current.query.assigneeId).toBe(USER_ID);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('treats an unrecognised assignee value as "anyone"', () => {
    const { result } = renderHook(() => useAssetListParams(USER_ID), {
      wrapper: wrapper('/assets?assignee=someone-else'),
    });

    expect(result.current.filters.assignee).toBe('anyone');
    expect(result.current.query.assigneeId).toBeUndefined();
  });
});
