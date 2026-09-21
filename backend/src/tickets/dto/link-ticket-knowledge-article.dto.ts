import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkTicketKnowledgeArticleDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Knowledge article to link to this ticket.',
  })
  @IsUUID()
  articleId!: string;
}
