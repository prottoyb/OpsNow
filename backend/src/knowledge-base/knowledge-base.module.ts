import { Module } from '@nestjs/common';
import { KnowledgeBaseCategoriesModule } from '../knowledge-base-categories/knowledge-base-categories.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

/**
 * Exports KnowledgeBaseService so TicketsModule can serve the ticket <->
 * article link routes from the existing TicketsController, exactly as
 * AssetsModule does for the asset links. The dependency runs one way only
 * (tickets -> knowledge-base); KnowledgeBaseService never imports
 * TicketsService, so no forwardRef is needed.
 */
@Module({
  imports: [KnowledgeBaseCategoriesModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
