import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AssetStatus, Prisma, Role } from '@prisma/client';
import { AssetTypesService } from '../asset-types/asset-types.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AssetsService } from './assets.service';

function buildUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'employee-1',
    email: 'employee@opsnow.local',
    passwordHash: 'hash',
    firstName: 'Jane',
    lastName: 'Doe',
    role: Role.Employee,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildAssetType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'type-1',
    name: 'Laptop',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    assetTag: 'LAPTOP-9001',
    name: 'Dell Latitude 5440',
    assetTypeId: 'type-1',
    status: AssetStatus.InStock,
    serialNumber: 'SN-1',
    currentAssigneeId: null,
    purchaseDate: null,
    warrantyExpiresAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    assetType: buildAssetType(),
    currentAssignee: null,
    ...overrides,
  };
}

function authUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'employee-1',
    email: 'employee@opsnow.local',
    role: Role.Employee,
    ...overrides,
  };
}

const staffUser = authUser({
  id: 'agent-1',
  email: 'agent@opsnow.local',
  role: Role.SupportAgent,
});

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('constraint failed', {
    code,
    clientVersion: 'test',
  });
}

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: {
    asset: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    assetAssignment: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    ticketAsset: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let usersService: { findById: jest.Mock };
  let assetTypesService: { findActiveById: jest.Mock };

  beforeEach(() => {
    prisma = {
      asset: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      assetAssignment: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      ticketAsset: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    usersService = { findById: jest.fn() };
    assetTypesService = { findActiveById: jest.fn() };

    service = new AssetsService(
      prisma as unknown as PrismaService,
      usersService as unknown as UsersService,
      assetTypesService as unknown as AssetTypesService,
    );
  });

  describe('create', () => {
    it('rejects a non-staff caller (defense-in-depth beyond the controller guard)', async () => {
      await expect(
        service.create(
          { assetTag: 'TAG-1', name: 'Laptop', assetTypeId: 'type-1' },
          authUser(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown assetTypeId', async () => {
      assetTypesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.create(
          { assetTag: 'TAG-1', name: 'Laptop', assetTypeId: 'nope' },
          staffUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });

    it('rejects an INACTIVE assetTypeId (findActiveById filters it out)', async () => {
      // findActiveById only ever returns active types, so an inactive one
      // reaches the service as null — the assertion that matters is that
      // the lookup is the active-only one.
      assetTypesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.create(
          { assetTag: 'TAG-1', name: 'Laptop', assetTypeId: 'inactive-type' },
          staffUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(assetTypesService.findActiveById).toHaveBeenCalledWith(
        'inactive-type',
      );
    });

    it('creates the asset InStock and unassigned', async () => {
      assetTypesService.findActiveById.mockResolvedValue(buildAssetType());
      prisma.asset.create.mockResolvedValue(buildAsset());
      prisma.asset.findFirst.mockResolvedValue(buildAsset());

      const result = await service.create(
        {
          assetTag: 'LAPTOP-9001',
          name: 'Dell Latitude 5440',
          assetTypeId: 'type-1',
        },
        staffUser,
      );

      expect(prisma.asset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetTag: 'LAPTOP-9001',
          status: AssetStatus.InStock,
          currentAssigneeId: null,
        }),
      });
      expect(result.status).toBe(AssetStatus.InStock);
      expect(result.currentAssignee).toBeNull();
    });

    it('maps a duplicate assetTag (P2002) to 409, never a raw 500', async () => {
      assetTypesService.findActiveById.mockResolvedValue(buildAssetType());
      prisma.asset.create.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.create(
          { assetTag: 'LAPTOP-0001', name: 'Dup', assetTypeId: 'type-1' },
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findAll', () => {
    // Visibility is ANDed as its own top-level clause, so flatten the
    // AND array before asserting on the effective `where`.
    function flattenWhere(mockCall: unknown): Record<string, unknown> {
      const where = (mockCall as { where: { AND: Record<string, unknown>[] } })
        .where;
      return Object.assign({}, ...where.AND);
    }

    it('scopes to the assets held by the caller for an Employee', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll({ limit: 20, offset: 0 } as never, authUser());

      const where = flattenWhere(prisma.asset.findMany.mock.calls[0][0]);
      expect(where).toMatchObject({
        deletedAt: null,
        currentAssigneeId: 'employee-1',
      });
    });

    it('does not scope by holder for staff, but still excludes soft-deleted assets', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll({ limit: 20, offset: 0 } as never, staffUser);

      const where = flattenWhere(prisma.asset.findMany.mock.calls[0][0]);
      expect(where).toMatchObject({ deletedAt: null });
      expect(where).not.toHaveProperty('currentAssigneeId');
    });

    it('applies the same where to findMany and count, so totals cannot leak out-of-scope rows', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll({ limit: 20, offset: 0 } as never, authUser());

      expect(prisma.asset.count.mock.calls[0][0].where).toEqual(
        prisma.asset.findMany.mock.calls[0][0].where,
      );
    });

    it('keeps the visibility scope when an Employee filters by another assigneeId', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(
        { limit: 20, offset: 0, assigneeId: 'employee-2' } as never,
        authUser(),
      );

      const clauses = (
        prisma.asset.findMany.mock.calls[0][0] as {
          where: { AND: Record<string, unknown>[] };
        }
      ).where.AND;
      // Both constraints survive as separate clauses — the filter can
      // never overwrite the ownership scoping.
      expect(clauses).toContainEqual(
        expect.objectContaining({ currentAssigneeId: 'employee-1' }),
      );
      expect(clauses).toContainEqual({ currentAssigneeId: 'employee-2' });
    });

    it('matches the free-text q case-insensitively over assetTag, name and serialNumber', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(
        { limit: 20, offset: 0, q: 'lat' } as never,
        staffUser,
      );

      const clauses = (
        prisma.asset.findMany.mock.calls[0][0] as {
          where: { AND: Record<string, unknown>[] };
        }
      ).where.AND;
      const contains = { contains: 'lat', mode: 'insensitive' };
      expect(clauses).toContainEqual({
        OR: [
          { assetTag: contains },
          { name: contains },
          { serialNumber: contains },
        ],
      });
    });

    it('passes status and assetTypeId filters through', async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);

      await service.findAll(
        {
          limit: 20,
          offset: 0,
          status: AssetStatus.InRepair,
          assetTypeId: 'type-9',
        } as never,
        staffUser,
      );

      const where = flattenWhere(prisma.asset.findMany.mock.calls[0][0]);
      expect(where).toMatchObject({
        status: AssetStatus.InRepair,
        assetTypeId: 'type-9',
      });
    });
  });

  describe('findOne', () => {
    it('scopes the lookup to the caller for an Employee', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());

      await service.findOne('asset-1', authUser());

      expect(prisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'asset-1',
            deletedAt: null,
            currentAssigneeId: 'employee-1',
          }),
        }),
      );
    });

    it('404s (not 403) for an asset outside the caller scope or soft-deleted', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.findOne('asset-1', authUser())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('excludes soft-deleted assets for staff too', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(service.findOne('asset-1', staffUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  describe('update', () => {
    it('rejects a non-staff caller', async () => {
      await expect(
        service.update('asset-1', { name: 'x' }, authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.asset.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an unknown or inactive assetTypeId', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());
      assetTypesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.update('asset-1', { assetTypeId: 'gone' }, staffUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });

    it('updates editable fields with a CAS on updatedAt and the visibility scope', async () => {
      const asset = buildAsset();
      prisma.asset.findFirst
        .mockResolvedValueOnce(asset)
        .mockResolvedValueOnce({ ...asset, name: 'Renamed' });
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });

      await service.update('asset-1', { name: 'Renamed' }, staffUser);

      expect(prisma.asset.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'asset-1',
          updatedAt: asset.updatedAt,
          deletedAt: null,
        },
        data: { name: 'Renamed' },
      });
    });

    it('never writes currentAssigneeId', async () => {
      const asset = buildAsset();
      prisma.asset.findFirst.mockResolvedValue(asset);
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });

      await service.update(
        'asset-1',
        { name: 'Renamed', status: AssetStatus.InRepair },
        staffUser,
      );

      const data = prisma.asset.updateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('currentAssigneeId');
    });

    it('rejects a status change to Assigned — assignment only happens through the assignment route', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());

      await expect(
        service.update('asset-1', { status: AssetStatus.Assigned }, staffUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.asset.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      AssetStatus.InRepair,
      AssetStatus.Retired,
      AssetStatus.Lost,
      AssetStatus.InStock,
    ])(
      'rejects moving a currently-assigned asset to %s — it must be returned first',
      async (status) => {
        prisma.asset.findFirst.mockResolvedValue(
          buildAsset({
            status: AssetStatus.Assigned,
            currentAssigneeId: 'employee-1',
          }),
        );

        await expect(
          service.update('asset-1', { status }, staffUser),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.asset.updateMany).not.toHaveBeenCalled();
      },
    );

    it('allows a non-assignment status change on an unassigned asset', async () => {
      const asset = buildAsset();
      prisma.asset.findFirst.mockResolvedValue(asset);
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });

      await service.update(
        'asset-1',
        { status: AssetStatus.InRepair },
        staffUser,
      );

      expect(prisma.asset.updateMany.mock.calls[0][0].data).toEqual({
        status: AssetStatus.InRepair,
      });
    });

    it('404s for a soft-deleted or out-of-scope asset', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.update('asset-1', { name: 'x' }, staffUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is a no-op when nothing actually changes', async () => {
      const asset = buildAsset();
      prisma.asset.findFirst.mockResolvedValue(asset);

      await service.update('asset-1', { name: asset.name }, staffUser);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns 409 when it loses the update race (CAS miss)', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());
      prisma.asset.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('asset-1', { name: 'Renamed' }, staffUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a duplicate-constraint violation to 409', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());
      prisma.asset.updateMany.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.update('asset-1', { name: 'Renamed' }, staffUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateAssignment', () => {
    it('rejects a non-staff caller', async () => {
      await expect(
        service.updateAssignment(
          'asset-1',
          { assignedToId: 'employee-1' },
          authUser(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.asset.findFirst).not.toHaveBeenCalled();
    });

    it('404s for a soft-deleted or unknown asset', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAssignment(
          'asset-1',
          { assignedToId: 'employee-1' },
          staffUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a nonexistent assignment target with 400', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.updateAssignment('asset-1', { assignedToId: 'ghost' }, staffUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an inactive assignment target with 400', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());
      usersService.findById.mockResolvedValue(
        buildUserRecord({ id: 'employee-2', isActive: false }),
      );

      await expect(
        service.updateAssignment(
          'asset-1',
          { assignedToId: 'employee-2' },
          staffUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts an Employee as the assignment target — employees hold equipment', async () => {
      const asset = buildAsset();
      const target = buildUserRecord({ id: 'employee-2', role: Role.Employee });
      prisma.asset.findFirst
        .mockResolvedValueOnce(asset)
        .mockResolvedValueOnce({
          ...asset,
          status: AssetStatus.Assigned,
          currentAssigneeId: 'employee-2',
          currentAssignee: target,
        });
      usersService.findById.mockResolvedValue(target);
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 0 });
      prisma.assetAssignment.create.mockResolvedValue({});

      const result = await service.updateAssignment(
        'asset-1',
        { assignedToId: 'employee-2' },
        staffUser,
      );

      expect(result.status).toBe(AssetStatus.Assigned);
      expect(result.currentAssignee?.id).toBe('employee-2');
    });

    it('assigns: CAS on assignee+status+visibility, sets Assigned, opens a ledger row', async () => {
      const asset = buildAsset();
      const target = buildUserRecord({ id: 'employee-2' });
      prisma.asset.findFirst
        .mockResolvedValueOnce(asset)
        .mockResolvedValueOnce({
          ...asset,
          status: AssetStatus.Assigned,
          currentAssigneeId: 'employee-2',
          currentAssignee: target,
        });
      usersService.findById.mockResolvedValue(target);
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 0 });
      prisma.assetAssignment.create.mockResolvedValue({});

      await service.updateAssignment(
        'asset-1',
        { assignedToId: 'employee-2', notes: 'Onboarding' },
        staffUser,
      );

      expect(prisma.asset.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'asset-1',
          currentAssigneeId: null,
          status: AssetStatus.InStock,
          deletedAt: null,
        },
        data: {
          currentAssigneeId: 'employee-2',
          status: AssetStatus.Assigned,
        },
      });
      expect(prisma.assetAssignment.create).toHaveBeenCalledWith({
        data: {
          assetId: 'asset-1',
          assignedToId: 'employee-2',
          assignedById: 'agent-1',
          notes: 'Onboarding',
        },
      });
    });

    it('returns: sets InStock, clears the assignee, closes the open ledger row', async () => {
      const held = buildAsset({
        status: AssetStatus.Assigned,
        currentAssigneeId: 'employee-1',
        currentAssignee: buildUserRecord(),
      });
      prisma.asset.findFirst
        .mockResolvedValueOnce(held)
        .mockResolvedValueOnce(buildAsset());
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateAssignment(
        'asset-1',
        { assignedToId: null },
        staffUser,
      );

      expect(prisma.asset.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'asset-1',
          currentAssigneeId: 'employee-1',
          status: AssetStatus.Assigned,
          deletedAt: null,
        },
        data: { currentAssigneeId: null, status: AssetStatus.InStock },
      });
      const close = prisma.assetAssignment.updateMany.mock.calls[0][0];
      expect(close.where).toEqual({ assetId: 'asset-1', returnedAt: null });
      expect(close.data.returnedAt).toBeInstanceOf(Date);
      expect(prisma.assetAssignment.create).not.toHaveBeenCalled();
      expect(result.status).toBe(AssetStatus.InStock);
      expect(result.currentAssignee).toBeNull();
    });

    it('reassigns: closes the previous ledger row AND opens a new one', async () => {
      const held = buildAsset({
        status: AssetStatus.Assigned,
        currentAssigneeId: 'employee-1',
        currentAssignee: buildUserRecord(),
      });
      const target = buildUserRecord({ id: 'employee-2' });
      prisma.asset.findFirst
        .mockResolvedValueOnce(held)
        .mockResolvedValueOnce({
          ...held,
          currentAssigneeId: 'employee-2',
          currentAssignee: target,
        });
      usersService.findById.mockResolvedValue(target);
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetAssignment.create.mockResolvedValue({});

      await service.updateAssignment(
        'asset-1',
        { assignedToId: 'employee-2' },
        staffUser,
      );

      expect(prisma.assetAssignment.updateMany).toHaveBeenCalledWith({
        where: { assetId: 'asset-1', returnedAt: null },
        data: { returnedAt: expect.any(Date) },
      });
      expect(prisma.assetAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ assignedToId: 'employee-2' }),
      });
      expect(prisma.asset.updateMany.mock.calls[0][0].where).toMatchObject({
        currentAssigneeId: 'employee-1',
        status: AssetStatus.Assigned,
      });
    });

    it('is a no-op when assigning to the current holder', async () => {
      prisma.asset.findFirst.mockResolvedValue(
        buildAsset({
          status: AssetStatus.Assigned,
          currentAssigneeId: 'employee-1',
          currentAssignee: buildUserRecord(),
        }),
      );

      await service.updateAssignment(
        'asset-1',
        { assignedToId: 'employee-1' },
        staffUser,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('is a no-op when returning an already-unassigned asset', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());

      const result = await service.updateAssignment(
        'asset-1',
        { assignedToId: null },
        staffUser,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.status).toBe(AssetStatus.InStock);
    });

    it.each([AssetStatus.InRepair, AssetStatus.Retired, AssetStatus.Lost])(
      'rejects assigning an asset in status %s with 400, attempting no write at all',
      async (status) => {
        prisma.asset.findFirst.mockResolvedValue(buildAsset({ status }));

        await expect(
          service.updateAssignment(
            'asset-1',
            { assignedToId: 'employee-2' },
            staffUser,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.asset.updateMany).not.toHaveBeenCalled();
        expect(prisma.assetAssignment.create).not.toHaveBeenCalled();
        // Blocked as validation, before the target lookup even happens.
        expect(usersService.findById).not.toHaveBeenCalled();
      },
    );

    it('still allows returning an asset that is InRepair while held', async () => {
      const held = buildAsset({
        status: AssetStatus.InRepair,
        currentAssigneeId: 'employee-1',
        currentAssignee: buildUserRecord(),
      });
      prisma.asset.findFirst
        .mockResolvedValueOnce(held)
        .mockResolvedValueOnce(buildAsset());
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 1 });

      await service.updateAssignment('asset-1', { assignedToId: null }, staffUser);

      expect(prisma.asset.updateMany).toHaveBeenCalled();
    });

    it('returns 409 when it loses the assignment race (CAS miss), writing no ledger row', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());
      usersService.findById.mockResolvedValue(
        buildUserRecord({ id: 'employee-2' }),
      );
      prisma.asset.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateAssignment(
          'asset-1',
          { assignedToId: 'employee-2' },
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.assetAssignment.create).not.toHaveBeenCalled();
      expect(prisma.assetAssignment.updateMany).not.toHaveBeenCalled();
    });

    it('re-asserts the visibility scope in the CAS where clause', async () => {
      const held = buildAsset({
        status: AssetStatus.Assigned,
        currentAssigneeId: 'employee-1',
        currentAssignee: buildUserRecord(),
      });
      prisma.asset.findFirst
        .mockResolvedValueOnce(held)
        .mockResolvedValueOnce(buildAsset());
      prisma.asset.updateMany.mockResolvedValue({ count: 1 });
      prisma.assetAssignment.updateMany.mockResolvedValue({ count: 1 });

      await service.updateAssignment('asset-1', { assignedToId: null }, staffUser);

      expect(prisma.asset.updateMany.mock.calls[0][0].where).toMatchObject({
        deletedAt: null,
      });
    });
  });

  describe('findAssignments', () => {
    it('rejects a non-staff caller', async () => {
      await expect(
        service.findAssignments('asset-1', { limit: 20, offset: 0 } as never, authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.asset.findFirst).not.toHaveBeenCalled();
    });

    it('404s for a soft-deleted or unknown asset, listing nothing', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.findAssignments('asset-1', { limit: 20, offset: 0 } as never, staffUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.assetAssignment.findMany).not.toHaveBeenCalled();
    });

    it('returns open and closed ledger rows, newest first, paginated', async () => {
      prisma.asset.findFirst.mockResolvedValue(buildAsset());
      prisma.assetAssignment.findMany.mockResolvedValue([
        {
          id: 'assign-2',
          assetId: 'asset-1',
          assignedAt: new Date('2026-02-01T00:00:00.000Z'),
          returnedAt: null,
          notes: null,
          assignedTo: buildUserRecord({ id: 'employee-2' }),
          assignedBy: buildUserRecord({ id: 'agent-1', role: Role.SupportAgent }),
        },
        {
          id: 'assign-1',
          assetId: 'asset-1',
          assignedAt: new Date('2026-01-01T00:00:00.000Z'),
          returnedAt: new Date('2026-01-20T00:00:00.000Z'),
          notes: 'first holder',
          assignedTo: buildUserRecord(),
          assignedBy: buildUserRecord({ id: 'agent-1', role: Role.SupportAgent }),
        },
      ]);
      prisma.assetAssignment.count.mockResolvedValue(2);

      const result = await service.findAssignments(
        'asset-1',
        { limit: 10, offset: 0 } as never,
        staffUser,
      );

      expect(prisma.assetAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assetId: 'asset-1' },
          take: 10,
          skip: 0,
          orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result.total).toBe(2);
      expect(result.data[0].returnedAt).toBeNull();
      expect(result.data[1].returnedAt).not.toBeNull();
      // User summaries never carry credentials or email addresses.
      expect(result.data[0].assignedTo).not.toHaveProperty('email');
      expect(result.data[0].assignedTo).not.toHaveProperty('passwordHash');
    });
  });

  describe('findForTicket', () => {
    it('excludes soft-deleted assets from the links it returns', async () => {
      prisma.ticketAsset.findMany.mockResolvedValue([]);

      await service.findForTicket('ticket-1');

      expect(prisma.ticketAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticketId: 'ticket-1', asset: { deletedAt: null } },
        }),
      );
    });

    it('maps each link with its asset embedded', async () => {
      prisma.ticketAsset.findMany.mockResolvedValue([
        {
          ticketId: 'ticket-1',
          assetId: 'asset-1',
          linkedAt: new Date(),
          linkedById: null,
          linkedBy: null,
          asset: buildAsset(),
        },
      ]);

      const result = await service.findForTicket('ticket-1');

      expect(result).toHaveLength(1);
      expect(result[0].asset.assetTag).toBe('LAPTOP-9001');
      expect(result[0].linkedBy).toBeNull();
    });
  });

  describe('linkToTicket', () => {
    const existingLink = {
      ticketId: 'ticket-1',
      assetId: 'asset-1',
      linkedAt: new Date(),
      linkedById: 'agent-1',
      linkedBy: buildUserRecord({ id: 'agent-1', role: Role.SupportAgent }),
      asset: buildAsset(),
    };

    it('rejects a non-staff caller', async () => {
      await expect(
        service.linkToTicket('ticket-1', 'asset-1', authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticketAsset.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown or soft-deleted asset with 400', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        service.linkToTicket('ticket-1', 'asset-1', staffUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'asset-1', deletedAt: null },
        }),
      );
      expect(prisma.ticketAsset.create).not.toHaveBeenCalled();
    });

    it('creates the link, recording who linked it', async () => {
      prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
      prisma.ticketAsset.findFirst.mockResolvedValue(null);
      prisma.ticketAsset.create.mockResolvedValue(existingLink);

      const result = await service.linkToTicket('ticket-1', 'asset-1', staffUser);

      expect(prisma.ticketAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ticketId: 'ticket-1', assetId: 'asset-1', linkedById: 'agent-1' },
        }),
      );
      expect(result.asset.id).toBe('asset-1');
    });

    it('is an idempotent no-op for an already-linked asset', async () => {
      prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
      prisma.ticketAsset.findFirst.mockResolvedValue(existingLink);

      const result = await service.linkToTicket('ticket-1', 'asset-1', staffUser);

      expect(prisma.ticketAsset.create).not.toHaveBeenCalled();
      expect(result.linkedAt).toEqual(existingLink.linkedAt);
    });

    it('returns the existing link instead of 409/500 when it loses the link race (P2002)', async () => {
      prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
      prisma.ticketAsset.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingLink);
      prisma.ticketAsset.create.mockRejectedValue(prismaError('P2002'));

      const result = await service.linkToTicket('ticket-1', 'asset-1', staffUser);

      expect(result.asset.id).toBe('asset-1');
    });
  });

  describe('unlinkFromTicket', () => {
    it('rejects a non-staff caller', async () => {
      await expect(
        service.unlinkFromTicket('ticket-1', 'asset-1', authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticketAsset.deleteMany).not.toHaveBeenCalled();
    });

    it('is idempotent: unlinking a link that does not exist still succeeds', async () => {
      prisma.ticketAsset.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.unlinkFromTicket('ticket-1', 'asset-1', staffUser),
      ).resolves.toBeUndefined();
      expect(prisma.ticketAsset.deleteMany).toHaveBeenCalledWith({
        where: { ticketId: 'ticket-1', assetId: 'asset-1' },
      });
    });
  });
});
