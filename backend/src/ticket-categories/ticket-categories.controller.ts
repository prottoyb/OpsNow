import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TicketCategoriesService } from './ticket-categories.service';
import { TicketCategoryResponseDto } from './dto/ticket-category-response.dto';

@ApiTags('ticket-categories')
@Controller('ticket-categories')
export class TicketCategoriesController {
  constructor(private readonly ticketCategoriesService: TicketCategoriesService) {}

  @Get()
  async findAll(): Promise<TicketCategoryResponseDto[]> {
    return this.ticketCategoriesService.findAllActive();
  }
}
