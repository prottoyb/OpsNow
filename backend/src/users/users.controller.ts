import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { FindAllResult, UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.Administrator)
  @Get()
  async findAll(@Query() query: ListUsersQueryDto): Promise<FindAllResult> {
    return this.usersService.findAll({
      limit: query.limit,
      offset: query.offset,
    });
  }
}
