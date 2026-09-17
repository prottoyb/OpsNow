import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AssetTypesService } from './asset-types.service';
import { AssetTypeResponseDto } from './dto/asset-type-response.dto';

@ApiTags('asset-types')
@Controller('asset-types')
export class AssetTypesController {
  constructor(private readonly assetTypesService: AssetTypesService) {}

  @Get()
  async findAll(): Promise<AssetTypeResponseDto[]> {
    return this.assetTypesService.findAllActive();
  }
}
