import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TicketAssetResponseDto } from '../assets/dto/ticket-asset-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { LinkTicketAssetDto } from './dto/link-ticket-asset.dto';
import { ListTicketCommentsQueryDto } from './dto/list-ticket-comments-query.dto';
import { ListTicketHistoryQueryDto } from './dto/list-ticket-history-query.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import {
  TicketCommentListResponseDto,
  TicketCommentResponseDto,
} from './dto/ticket-comment-response.dto';
import { TicketHistoryListResponseDto } from './dto/ticket-history-response.dto';
import {
  TicketListResponseDto,
  TicketResponseDto,
} from './dto/ticket-response.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { STAFF_ROLES } from './tickets.constants';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  async create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.create(dto, user);
  }

  @Get()
  async findAll(
    @Query() query: ListTicketsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketListResponseDto> {
    return this.ticketsService.findAll(query, user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.findOne(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.update(id, dto, user);
  }

  @Roles(...STAFF_ROLES)
  @Patch(':id/assignment')
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.assign(id, dto, user);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.updateStatus(id, dto, user);
  }

  @Roles(...STAFF_ROLES)
  @Patch(':id/priority')
  async updatePriority(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketPriorityDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.updatePriority(id, dto, user);
  }

  @Post(':id/comments')
  async createComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketCommentResponseDto> {
    return this.ticketsService.createComment(id, dto, user);
  }

  @Get(':id/comments')
  async findComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTicketCommentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketCommentListResponseDto> {
    return this.ticketsService.findComments(id, query, user);
  }

  @Roles(...STAFF_ROLES)
  @Get(':id/history')
  async findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTicketHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketHistoryListResponseDto> {
    return this.ticketsService.findHistory(id, query, user);
  }

  /** Readable by anyone who can already see the ticket; the list is
   * bounded by the number of assets on one ticket, so it is unpaginated. */
  @Get(':id/assets')
  async findAssets(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketAssetResponseDto[]> {
    return this.ticketsService.findAssets(id, user);
  }

  /** Idempotent: re-linking an already-linked asset returns the existing
   * link rather than failing. */
  @Roles(...STAFF_ROLES)
  @Post(':id/assets')
  async linkAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkTicketAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketAssetResponseDto> {
    return this.ticketsService.linkAsset(id, dto, user);
  }

  /** Idempotent: unlinking an asset that is not linked succeeds. */
  @Roles(...STAFF_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/assets/:assetId')
  async unlinkAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.ticketsService.unlinkAsset(id, assetId, user);
  }
}
