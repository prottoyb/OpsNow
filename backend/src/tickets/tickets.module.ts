import { Module } from '@nestjs/common';
import { TicketCategoriesModule } from '../ticket-categories/ticket-categories.module';
import { UsersModule } from '../users/users.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [UsersModule, TicketCategoriesModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
