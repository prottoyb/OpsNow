import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
  MaxDate,
  MinDate,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  MAX_ACCEPTED_DATE,
  MIN_ACCEPTED_DATE,
  toIsoDate,
} from '../../common/transforms/iso-date.transform';
import { IsNotBeforeFrom } from '../../common/validators/is-not-before-from.validator';
import {
  AUDIT_ACTIONS,
  AuditActionName,
  AuditEntityType,
  AuditOutcome,
} from '../audit.constants';

/**
 * Filters for GET /audit-logs. All optional, all exact-match (dates are an
 * inclusive range), all ANDed together. Every value is validated against a
 * closed set or a UUID, so nothing free-form reaches the query.
 */
export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Who performed the action.' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditActionName;

  @ApiPropertyOptional({ enum: AuditEntityType })
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ enum: AuditOutcome })
  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Earliest event time (inclusive), ISO 8601.',
  })
  @IsOptional()
  @Transform(toIsoDate)
  @IsDate()
  @MinDate(MIN_ACCEPTED_DATE)
  @MaxDate(MAX_ACCEPTED_DATE)
  from?: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Latest event time (inclusive), ISO 8601. Not before `from`.',
  })
  @IsOptional()
  @Transform(toIsoDate)
  @IsDate()
  @MinDate(MIN_ACCEPTED_DATE)
  @MaxDate(MAX_ACCEPTED_DATE)
  @IsNotBeforeFrom()
  to?: Date;
}
