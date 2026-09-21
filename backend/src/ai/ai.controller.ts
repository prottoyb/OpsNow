import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { STAFF_ROLES } from '../tickets/tickets.constants';
import { AiAssistantService } from './ai-assistant.service';
import {
  AiDraftResponseDto,
  AiResolutionSummaryResponseDto,
  AiStatusResponseDto,
  AiTriageResponseDto,
} from './dto/ai-response.dto';

/**
 * Advisory only (ADR-023 Decision 5): nothing here mutates a ticket. The
 * POSTs are staff-only, with a service-level assertion behind each @Roles
 * guard, and are POST (not GET) because they cost money and call a third
 * party. They return 200, not 201: nothing is created.
 *
 * `GET /ai/status` is open to any authenticated user; `enabled` already folds
 * the role check in.
 */
@ApiTags('ai')
@Controller()
export class AiController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get('ai/status')
  getStatus(@CurrentUser() user: AuthenticatedUser): AiStatusResponseDto {
    return this.aiAssistantService.status(user);
  }

  @Roles(...STAFF_ROLES)
  @Post('tickets/:id/ai/triage')
  @HttpCode(HttpStatus.OK)
  triage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiTriageResponseDto> {
    return this.aiAssistantService.triage(id, user);
  }

  @Roles(...STAFF_ROLES)
  @Post('tickets/:id/ai/draft-response')
  @HttpCode(HttpStatus.OK)
  draftResponse(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiDraftResponseDto> {
    return this.aiAssistantService.draftResponse(id, user);
  }

  @Roles(...STAFF_ROLES)
  @Post('tickets/:id/ai/resolution-summary')
  @HttpCode(HttpStatus.OK)
  resolutionSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiResolutionSummaryResponseDto> {
    return this.aiAssistantService.resolutionSummary(id, user);
  }
}
