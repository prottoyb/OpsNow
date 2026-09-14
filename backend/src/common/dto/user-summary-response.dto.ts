import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

/** Swagger-visible class mirroring UsersService's UserSummary interface
 * (id/firstName/lastName/role — no email, no passwordHash). Interfaces
 * produce an empty Swagger schema; this is the documented shape for
 * embedding a user summary in another domain's response. */
export class UserSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: Role })
  role!: Role;
}
