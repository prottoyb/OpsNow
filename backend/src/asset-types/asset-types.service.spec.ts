import { PrismaService } from '../prisma/prisma.service';
import { AssetTypesService } from './asset-types.service';

describe('AssetTypesService', () => {
  let service: AssetTypesService;
  let prisma: {
    assetType: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      assetType: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    service = new AssetTypesService(prisma as unknown as PrismaService);
  });

  describe('findAllActive', () => {
    it('returns only active asset types, mapped to the response shape', async () => {
      prisma.assetType.findMany.mockResolvedValue([
        {
          id: 'type-1',
          name: 'Laptop',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.findAllActive();

      expect(prisma.assetType.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      expect(result).toEqual([{ id: 'type-1', name: 'Laptop', isActive: true }]);
    });
  });

  describe('findActiveById', () => {
    it('queries by id and active status', async () => {
      prisma.assetType.findFirst.mockResolvedValue(null);

      await service.findActiveById('type-1');

      expect(prisma.assetType.findFirst).toHaveBeenCalledWith({
        where: { id: 'type-1', isActive: true },
      });
    });
  });
});
