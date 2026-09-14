import { Injectable } from '@nestjs/common';
import { TicketCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketCategoryResponseDto } from './dto/ticket-category-response.dto';

@Injectable()
export class TicketCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flat list of active categories — the client builds the tree from
   * `parentId`. Needed so a caller can discover valid `categoryId`
   * values when creating or updating a ticket. */
  async findAllActive(): Promise<TicketCategoryResponseDto[]> {
    const categories = await this.prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return categories.map(toTicketCategoryResponse);
  }

  /** Used by TicketsService to validate a submitted categoryId. Returns
   * null if the category doesn't exist or is inactive. Any active node
   * (parent or leaf) is a valid ticket category. */
  async findActiveById(id: string): Promise<TicketCategory | null> {
    return this.prisma.ticketCategory.findFirst({
      where: { id, isActive: true },
    });
  }
}

export function toTicketCategoryResponse(
  category: TicketCategory,
): TicketCategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    isActive: category.isActive,
  };
}
