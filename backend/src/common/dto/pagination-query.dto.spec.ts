import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_PAGINATION_OFFSET, PaginationQueryDto } from './pagination-query.dto';

function failedProperties(query: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(PaginationQueryDto, query)).map((e) => e.property);
}

describe('PaginationQueryDto offset', () => {
  it('accepts 0 and the documented maximum', () => {
    expect(failedProperties({ offset: '0' })).toEqual([]);
    expect(failedProperties({ offset: String(MAX_PAGINATION_OFFSET) })).toEqual([]);
  });

  it.each([
    String(MAX_PAGINATION_OFFSET + 1),
    '99999999999999999999',
    '1e30',
    '-1',
    '1.5',
  ])('rejects offset=%s', (value) => {
    expect(failedProperties({ offset: value })).toEqual(['offset']);
  });

  it('keeps the maximum within a signed 32-bit integer', () => {
    expect(MAX_PAGINATION_OFFSET).toBeLessThan(2 ** 31);
  });
});
