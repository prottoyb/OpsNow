import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Enforced by the globally-registered
 * RolesGuard (see auth.module.ts) — no @UseGuards() needed on the route
 * itself. A route with no @Roles() is reachable by any authenticated user;
 * @Public() always takes precedence over @Roles() (see RolesGuard).
 */
export const Roles = (...roles: Role[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
