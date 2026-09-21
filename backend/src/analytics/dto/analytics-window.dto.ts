import { ApiProperty } from '@nestjs/swagger';

/** The reporting window actually applied, after defaults were resolved. */
export class AnalyticsWindowDto {
  @ApiProperty({ format: 'date-time', description: 'Start of the window (inclusive).' })
  from!: string;

  @ApiProperty({ format: 'date-time', description: 'End of the window (inclusive).' })
  to!: string;
}
