import { ApiProperty } from '@nestjs/swagger';
import { AssetStatus } from '@prisma/client';
import { AssetTypeResponseDto } from '../../asset-types/dto/asset-type-response.dto';

/**
 * The deliberately narrow shape an asset takes when it is embedded in
 * something else — today, a ticket <-> asset link.
 *
 * The ticket-link list answers "which assets is this ticket about", not
 * "tell me everything about this asset". Full detail (serialNumber,
 * staff-authored notes, currentAssignee, purchase/warranty dates) stays
 * behind GET /assets/:id, which is already correctly row-scoped by
 * `common/asset-visibility.ts`. Embedding the full AssetResponseDto here
 * handed an Employee exactly the fields that route 404s for them.
 *
 * The projection is uniform for every role on purpose: a single shape
 * means there is no role-dependent projection to get wrong, and the
 * fragile "the caller is responsible for scoping" seam shrinks to ticket
 * visibility only.
 */
export class AssetSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Stable human-facing identifier, e.g. "LAPTOP-0001".' })
  assetTag!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: AssetStatus })
  status!: AssetStatus;

  @ApiProperty({ type: AssetTypeResponseDto })
  assetType!: AssetTypeResponseDto;
}
