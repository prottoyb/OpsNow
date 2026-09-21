import { Injectable } from '@nestjs/common';
import { KnowledgeBaseCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeBaseCategoryResponseDto } from './dto/knowledge-base-category-response.dto';

/**
 * Read-only, exactly like TicketCategoriesService.
 *
 * There is deliberately NO category CRUD in Phase 9: knowledge-base
 * categories are admin-managed reference data owned by the seed (and, in
 * a real deployment, by a migration), on the same reasoning recorded for
 * ticket categories in Phase 6a. A category is referenced by articles
 * through a `Restrict`/`SetNull` FK, so creating and especially deleting
 * one is a data-migration concern rather than an everyday API operation;
 * exposing it as CRUD would invite exactly the orphaning and re-parenting
 * problems the hierarchy's `onDelete: Restrict` exists to prevent.
 */
@Injectable()
export class KnowledgeBaseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flat list of active categories — the client builds the tree from
   * `parentId`. Needed so a caller can discover valid `categoryId` values
   * when creating or updating an article. */
  async findAllActive(): Promise<KnowledgeBaseCategoryResponseDto[]> {
    const categories = await this.prisma.knowledgeBaseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return categories.map(toKnowledgeBaseCategoryResponse);
  }

  /** Used by KnowledgeBaseService to validate a submitted categoryId.
   * Returns null if the category doesn't exist or is inactive. Any active
   * node (parent or leaf) is a valid article category. */
  async findActiveById(id: string): Promise<KnowledgeBaseCategory | null> {
    return this.prisma.knowledgeBaseCategory.findFirst({
      where: { id, isActive: true },
    });
  }
}

export function toKnowledgeBaseCategoryResponse(
  category: KnowledgeBaseCategory,
): KnowledgeBaseCategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    isActive: category.isActive,
  };
}
