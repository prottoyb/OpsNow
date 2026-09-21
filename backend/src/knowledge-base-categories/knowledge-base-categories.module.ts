import { Module } from '@nestjs/common';
import { KnowledgeBaseCategoriesController } from './knowledge-base-categories.controller';
import { KnowledgeBaseCategoriesService } from './knowledge-base-categories.service';

/** Exports the service so KnowledgeBaseModule can validate a submitted
 * `categoryId` against the same "active only" rule the read endpoint
 * publishes — mirrors TicketCategoriesModule. */
@Module({
  controllers: [KnowledgeBaseCategoriesController],
  providers: [KnowledgeBaseCategoriesService],
  exports: [KnowledgeBaseCategoriesService],
})
export class KnowledgeBaseCategoriesModule {}
