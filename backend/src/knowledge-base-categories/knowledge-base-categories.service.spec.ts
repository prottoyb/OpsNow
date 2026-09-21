import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseCategoriesService } from './knowledge-base-categories.service';

describe('KnowledgeBaseCategoriesService', () => {
  let service: KnowledgeBaseCategoriesService;
  let prisma: {
    knowledgeBaseCategory: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      knowledgeBaseCategory: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    service = new KnowledgeBaseCategoriesService(
      prisma as unknown as PrismaService,
    );
  });

  describe('findAllActive', () => {
    it('returns only active categories, mapped to the response shape', async () => {
      prisma.knowledgeBaseCategory.findMany.mockResolvedValue([
        {
          id: 'kb-cat-1',
          name: 'Troubleshooting',
          parentId: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.findAllActive();

      expect(prisma.knowledgeBaseCategory.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      expect(result).toEqual([
        {
          id: 'kb-cat-1',
          name: 'Troubleshooting',
          parentId: null,
          isActive: true,
        },
      ]);
    });

    it('does not leak the raw timestamps the table carries', async () => {
      prisma.knowledgeBaseCategory.findMany.mockResolvedValue([
        {
          id: 'kb-cat-1',
          name: 'Getting Started',
          parentId: 'kb-cat-0',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const [category] = await service.findAllActive();

      expect(Object.keys(category).sort()).toEqual([
        'id',
        'isActive',
        'name',
        'parentId',
      ]);
    });
  });

  describe('findActiveById', () => {
    it('queries by id and active status', async () => {
      prisma.knowledgeBaseCategory.findFirst.mockResolvedValue(null);

      await service.findActiveById('kb-cat-1');

      expect(prisma.knowledgeBaseCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'kb-cat-1', isActive: true },
      });
    });
  });
});
