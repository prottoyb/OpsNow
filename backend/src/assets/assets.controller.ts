import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import { AssetsService } from './assets.service';
import { AssignAssetDto } from './dto/assign-asset.dto';
import { AssetAssignmentListResponseDto } from './dto/asset-assignment-response.dto';
import { AssetListResponseDto, AssetResponseDto } from './dto/asset-response.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { ListAssetAssignmentsQueryDto } from './dto/list-asset-assignments-query.dto';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

/**
 * Read routes are open to any authenticated user but row-scoped by
 * AssetsService (an Employee only ever sees the assets assigned to them).
 * Every mutating route is staff-only via @Roles, and AssetsService
 * re-checks the role itself as defense in depth.
 */
@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Roles(...STAFF_ROLES)
  @Post()
  async create(
    @Body() dto: CreateAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    return this.assetsService.create(dto, user);
  }

  @Get()
  async findAll(
    @Query() query: ListAssetsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetListResponseDto> {
    return this.assetsService.findAll(query, user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    return this.assetsService.findOne(id, user);
  }

  @Roles(...STAFF_ROLES)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    return this.assetsService.update(id, dto, user);
  }

  @Roles(...STAFF_ROLES)
  @Patch(':id/assignment')
  async updateAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    return this.assetsService.updateAssignment(id, dto, user);
  }

  @Roles(...STAFF_ROLES)
  @Get(':id/assignments')
  async findAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListAssetAssignmentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetAssignmentListResponseDto> {
    return this.assetsService.findAssignments(id, query, user);
  }
}
