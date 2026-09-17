import { Injectable } from '@nestjs/common';
import { AssetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssetTypeResponseDto } from './dto/asset-type-response.dto';

@Injectable()
export class AssetTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flat list of active asset types, so a caller can discover valid
   * `assetTypeId` values when creating or updating an asset. Read-only:
   * there is no asset-type CRUD in Phase 8a (see TASKS.md). */
  async findAllActive(): Promise<AssetTypeResponseDto[]> {
    const assetTypes = await this.prisma.assetType.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return assetTypes.map(toAssetTypeResponse);
  }

  /** Used by AssetsService to validate a submitted assetTypeId. Returns
   * null if the type doesn't exist or is inactive. */
  async findActiveById(id: string): Promise<AssetType | null> {
    return this.prisma.assetType.findFirst({
      where: { id, isActive: true },
    });
  }
}

export function toAssetTypeResponse(
  assetType: AssetType,
): AssetTypeResponseDto {
  return {
    id: assetType.id,
    name: assetType.name,
    isActive: assetType.isActive,
  };
}
