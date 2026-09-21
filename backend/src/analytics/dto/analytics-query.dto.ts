import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxDate,
  MinDate,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import {
  MAX_ACCEPTED_DATE,
  MIN_ACCEPTED_DATE,
  toIsoDate,
} from '../../common/transforms/iso-date.transform';
import { DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS } from '../analytics.constants';

/**
 * Rejects a window whose end is before its start.
 *
 * Declared on `to` rather than `from` so the error names the field the caller
 * most likely mistyped, and skipped entirely unless BOTH ends are present and
 * are real Dates — otherwise a caller who sent only a malformed `from` would
 * get two errors for one mistake, the second of them misleading.
 */
function IsNotBeforeFrom(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isNotBeforeFrom',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const { from } = args.object as { from?: unknown };
          if (!(value instanceof Date) || !(from instanceof Date)) {
            return true;
          }
          return from.getTime() <= value.getTime();
        },
        defaultMessage(): string {
          return 'to must be the same as or later than from';
        },
      },
    });
  };
}

/**
 * The one query shape shared by all four analytics endpoints
 * (`/analytics/tickets`, `/analytics/sla`, `/analytics/categories`,
 * `/analytics/agents`). One DTO rather than four near-identical ones, because
 * the filters mean the same thing on every route and a caller moving between
 * tabs of one dashboard should not have to learn four spellings of the same
 * window.
 *
 * `from`/`to` use the shared `toIsoDate` transform rather than
 * `@Type(() => Date)` for the reason that transform documents: `new Date()`
 * silently reads a bare JSON number as epoch milliseconds and happily builds
 * a year outside the Postgres range, which then fails in the driver as a 500
 * instead of here as a 400.
 *
 * None of these filters is role-gated, and none needs to be: the service ANDs
 * the caller's own visibility clause in as a separate top-level clause, so a
 * filter can only ever NARROW an aggregate, never widen it — the same
 * construction, for the same reason, as `ListKnowledgeArticlesQueryDto`.
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description:
      `Start of the reporting window (inclusive), ISO 8601. ` +
      `Defaults to ${DEFAULT_WINDOW_DAYS} days before \`to\`. The window may ` +
      `span at most ${MAX_WINDOW_DAYS} days; a wider one is rejected rather ` +
      `than quietly narrowed.`,
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
    description:
      'End of the reporting window (inclusive), ISO 8601. Defaults to the ' +
      'current instant. Must not be earlier than `from`.',
  })
  @IsOptional()
  @Transform(toIsoDate)
  @IsDate()
  @MinDate(MIN_ACCEPTED_DATE)
  @MaxDate(MAX_ACCEPTED_DATE)
  @IsNotBeforeFrom()
  to?: Date;

  @ApiPropertyOptional({
    enum: TicketPriority,
    description: 'Narrows every figure to tickets of this priority.',
  })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Narrows every figure to tickets in this category.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "Narrows every figure to this assignee's tickets.",
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
