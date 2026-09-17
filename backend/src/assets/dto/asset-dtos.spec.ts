import { AssetStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssignAssetDto } from './assign-asset.dto';
import { CreateAssetDto } from './create-asset.dto';
import { UpdateAssetDto } from './update-asset.dto';

/**
 * DTO-level validation is the first line that keeps unbounded or
 * malformed input away from the database: every free-text cap here
 * matches the schema's column width, so an oversized value is a 400
 * rather than a raw driver error.
 */
function failedProperties(dto: object): string[] {
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
    (error) => error.property,
  );
}

function createDto(overrides: Record<string, unknown> = {}): CreateAssetDto {
  return plainToInstance(CreateAssetDto, {
    assetTag: 'LAPTOP-9001',
    name: 'Dell Latitude 5440',
    assetTypeId: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  });
}

describe('CreateAssetDto', () => {
  it('accepts a valid payload', () => {
    expect(failedProperties(createDto())).toEqual([]);
  });

  it.each([
    ['assetTag', { assetTag: 'x'.repeat(51) }],
    ['name', { name: 'x'.repeat(151) }],
    ['serialNumber', { serialNumber: 'x'.repeat(101) }],
    ['notes', { notes: 'x'.repeat(5001) }],
  ])('rejects an oversized %s', (property, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });

  it.each([
    ['assetTag', { assetTag: '   ' }],
    ['name', { name: '   ' }],
  ])('rejects a whitespace-only %s (trimmed before validation)', (property, overrides) => {
    expect(failedProperties(createDto(overrides))).toContain(property);
  });

  it('rejects a non-uuid assetTypeId', () => {
    expect(failedProperties(createDto({ assetTypeId: 'not-a-uuid' }))).toContain(
      'assetTypeId',
    );
  });

  it('rejects a malformed date', () => {
    expect(failedProperties(createDto({ purchaseDate: 'yesterday' }))).toContain(
      'purchaseDate',
    );
  });

  it('accepts an ISO date, transformed to a Date', () => {
    const dto = createDto({ purchaseDate: '2026-01-15' });
    expect(failedProperties(dto)).toEqual([]);
    expect(dto.purchaseDate).toBeInstanceOf(Date);
  });
});

describe('UpdateAssetDto', () => {
  it('accepts an empty payload — every field is optional', () => {
    expect(failedProperties(plainToInstance(UpdateAssetDto, {}))).toEqual([]);
  });

  it('accepts a known AssetStatus', () => {
    const dto = plainToInstance(UpdateAssetDto, {
      status: AssetStatus.InRepair,
    });
    expect(failedProperties(dto)).toEqual([]);
  });

  it('rejects a status outside the AssetStatus enum', () => {
    const dto = plainToInstance(UpdateAssetDto, { status: 'Exploded' });
    expect(failedProperties(dto)).toContain('status');
  });

  it('rejects an oversized notes value', () => {
    const dto = plainToInstance(UpdateAssetDto, { notes: 'x'.repeat(5001) });
    expect(failedProperties(dto)).toContain('notes');
  });
});

describe('AssignAssetDto', () => {
  it('accepts an explicit null (a return)', () => {
    const dto = plainToInstance(AssignAssetDto, { assignedToId: null });
    expect(failedProperties(dto)).toEqual([]);
  });

  it('accepts a uuid target with notes', () => {
    const dto = plainToInstance(AssignAssetDto, {
      assignedToId: '22222222-2222-4222-8222-222222222222',
      notes: 'Issued at onboarding',
    });
    expect(failedProperties(dto)).toEqual([]);
  });

  it('rejects a missing assignedToId — a return must be explicit', () => {
    const dto = plainToInstance(AssignAssetDto, {});
    expect(failedProperties(dto)).toContain('assignedToId');
  });

  it('rejects a non-uuid target', () => {
    const dto = plainToInstance(AssignAssetDto, { assignedToId: 'nope' });
    expect(failedProperties(dto)).toContain('assignedToId');
  });

  it('rejects oversized notes', () => {
    const dto = plainToInstance(AssignAssetDto, {
      assignedToId: null,
      notes: 'x'.repeat(5001),
    });
    expect(failedProperties(dto)).toContain('notes');
  });
});
