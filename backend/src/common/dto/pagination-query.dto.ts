import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Upper bound for `offset`. One million rows is far beyond anything a client
 * can page to at the 100-row page cap (10,000 pages) and far below the signed
 * 32-bit integer ceiling (2,147,483,647), so Prisma's `skip` and Postgres'
 * OFFSET always accept it. Without a bound, a value such as 1e30 passed
 * `@IsInt` and reached Prisma, which failed with a 500 instead of a 400.
 */
export const MAX_PAGINATION_OFFSET = 1_000_000;

/**
 * Shared limit/offset pagination base for list endpoints. Concrete list
 * query DTOs extend this rather than redeclaring the same four decorators
 * (see DECISIONS.md ADR-007's addendum for the `{data,total}` envelope
 * convention this pairs with).
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: MAX_PAGINATION_OFFSET })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PAGINATION_OFFSET)
  offset: number = 0;
}
