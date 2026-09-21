import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { accessDenied } from '../../audit/audit.events';
import { AuditService } from '../../audit/audit.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

/**
 * Registered globally alongside JwtAuthGuard (see auth.module.ts), after
 * it, so every route enforces role restrictions by default with no
 * per-route @UseGuards() to forget. A route needs no annotation to allow
 * any authenticated user in; @Roles(...) opts a route INTO a role
 * restriction, the reverse of JwtAuthGuard's @Public() opt-out.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() routes never populate request.user (JwtAuthGuard
    // short-circuits before Passport runs) — always let them through
    // rather than risk reading a role off an undefined user. A route
    // marked both @Public() and @Roles() is a contradiction; @Public()
    // wins, predictably, rather than crashing.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Distinguish "no @Roles() at all" (undefined — any authenticated
    // user is allowed) from "@Roles() applied with an empty list" (a
    // near-certain decorator misuse — fail closed rather than silently
    // behaving as if no restriction were requested).
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user || requiredRoles.length === 0 || !requiredRoles.includes(user.role)) {
      if (user) {
        // Authenticated but not permitted: a permission-sensitive event.
        // (Unauthenticated callers never reach here — JwtAuthGuard 401s
        // first — and have no identity to attribute anyway.) Only the role
        // list, method and route PATTERN are recorded, never the URL/query.
        await this.audit.record(
          accessDenied(
            user.id,
            user.role,
            requiredRoles,
            request.method,
            `${request.baseUrl ?? ''}${(request.route as { path?: string } | undefined)?.path ?? ''}`,
            { ipAddress: request.ip, userAgent: request.headers?.['user-agent'] },
          ),
        );
      }
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
