import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class AssignTicketDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'User id to assign, or null to unassign.',
  })
  @ValidateIf((dto: AssignTicketDto) => dto.assigneeId !== null)
  @IsUUID()
  assigneeId!: string | null;
}
