import { PrismaService } from '../prisma/prisma.service';
import { TicketCategoriesService } from './ticket-categories.service';

describe('TicketCategoriesService', () => {
  let service: TicketCategoriesService;
  let prisma: {
    ticketCategory: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      ticketCategory: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    service = new TicketCategoriesService(prisma as unknown as PrismaService);
  });

  describe('findAllActive', () => {
    it('returns only active categories, mapped to the response shape', async () => {
      prisma.ticketCategory.findMany.mockResolvedValue([
        {
          id: 'cat-1',
          name: 'Hardware',
          parentId: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.findAllActive();

      expect(prisma.ticketCategory.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      expect(result).toEqual([
        { id: 'cat-1', name: 'Hardware', parentId: null, isActive: true },
      ]);
    });
  });

  describe('findActiveById', () => {
    it('queries by id and active status', async () => {
      prisma.ticketCategory.findFirst.mockResolvedValue(null);

      await service.findActiveById('cat-1');

      expect(prisma.ticketCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', isActive: true },
      });
    });
  });
});
