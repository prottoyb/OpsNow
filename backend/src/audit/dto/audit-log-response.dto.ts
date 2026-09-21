import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryResponseDto } from '../../common/dto/user-summary-response.dto';

export class AuditLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty({ nullable: true, description: 'success | failure | denied' })
  outcome!: string | null;

  @ApiProperty({ nullable: true })
  entityType!: string | null;

  @ApiProperty({ nullable: true })
  entityId!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Allow-listed, sanitised event details. Never contains credentials.',
  })
  metadata!: Record<string, unknown>;

  @ApiProperty({ nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ nullable: true })
  userAgent!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: UserSummaryResponseDto, nullable: true })
  actor!: UserSummaryResponseDto | null;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data!: AuditLogResponseDto[];

  @ApiProperty()
  total!: number;
}
