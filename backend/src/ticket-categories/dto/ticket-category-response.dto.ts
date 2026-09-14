import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TicketCategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  parentId!: string | null;

  @ApiProperty()
  isActive!: boolean;
}
