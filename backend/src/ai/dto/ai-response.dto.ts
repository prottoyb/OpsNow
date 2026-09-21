import { ApiProperty } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';
import { AiMode } from '../ai.types';

export class AiStatusResponseDto {
  @ApiProperty({
    description:
      'True only when a provider is configured AND the caller is staff, so a client needs no role logic of its own.',
  })
  enabled!: boolean;

  @ApiProperty({ enum: ['disabled', 'mock', 'anthropic'] })
  mode!: AiMode;
}

export class AiCategorySuggestionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Read from the database, never from the model.' })
  name!: string;
}

export class AiArticleReferenceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Read from the database, never from the model.' })
  title!: string;

  @ApiProperty()
  slug!: string;
}

export class AiTriageResponseDto {
  @ApiProperty({ type: AiCategorySuggestionDto, nullable: true })
  suggestedCategory!: AiCategorySuggestionDto | null;

  @ApiProperty({ enum: TicketPriority, nullable: true })
  suggestedPriority!: TicketPriority | null;

  @ApiProperty({ nullable: true, type: String })
  rationale!: string | null;

  @ApiProperty({ type: [AiArticleReferenceDto] })
  relatedArticles!: AiArticleReferenceDto[];

  @ApiProperty({ enum: ['mock', 'anthropic'] })
  mode!: AiMode;
}

export class AiDraftResponseDto {
  @ApiProperty({ description: 'AI-generated text. A human must review it before it is sent.' })
  draft!: string;

  @ApiProperty({ type: [AiArticleReferenceDto] })
  referencedArticles!: AiArticleReferenceDto[];

  @ApiProperty({ enum: ['mock', 'anthropic'] })
  mode!: AiMode;
}

export class AiResolutionSummaryResponseDto {
  @ApiProperty()
  summary!: string;

  @ApiProperty({ enum: ['mock', 'anthropic'] })
  mode!: AiMode;
}
