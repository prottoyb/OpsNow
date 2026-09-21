import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Shaped identically to TicketCategoryResponseDto: the two taxonomies
 * are separate tables but present the same flat id/name/parentId/isActive
 * contract, so a client can build both trees with one piece of code. */
export class KnowledgeBaseCategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  parentId!: string | null;

  @ApiProperty()
  isActive!: boolean;
}
