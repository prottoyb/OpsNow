import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { KnowledgeBaseCategoryResponseDto } from './dto/knowledge-base-category-response.dto';
import { KnowledgeBaseCategoriesService } from './knowledge-base-categories.service';

/**
 * Mounted at `kb-categories` rather than `knowledge-base-categories` to
 * keep the URL short and to match the `kb-articles` sibling; the module
 * directory keeps the fully spelled-out name that the Nest class names
 * use.
 *
 * Open to any authenticated user and unpaginated: the taxonomy is small,
 * reference-only, and carries nothing role-sensitive — an Employee needs
 * it to filter the article list just as much as staff do. Only ACTIVE
 * categories are returned; a retired one stays resolvable on the articles
 * that still reference it but can no longer be chosen.
 */
@ApiTags('kb-categories')
@Controller('kb-categories')
export class KnowledgeBaseCategoriesController {
  constructor(
    private readonly knowledgeBaseCategoriesService: KnowledgeBaseCategoriesService,
  ) {}

  @Get()
  async findAll(): Promise<KnowledgeBaseCategoryResponseDto[]> {
    return this.knowledgeBaseCategoriesService.findAllActive();
  }
}
