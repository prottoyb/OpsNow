import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function buildContext(user?: { role: Role }): ExecutionContext {
  const handler = function handler() {};
  const controller = class Controller {};
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

function buildReflector(metadata: {
  isPublic?: boolean;
  roles?: Role[];
}): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'isPublic') return metadata.isPublic;
      if (key === 'roles') return metadata.roles;
      return undefined;
    }),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows a @Public() route through, even if @Roles() is also (mistakenly) set', () => {
    const guard = new RolesGuard(
      buildReflector({ isPublic: true, roles: [Role.Administrator] }),
    );

    // No request.user at all — a @Public() route never runs through
    // JwtStrategy, so this must not throw trying to read a role off it.
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('allows an authenticated user through when no @Roles() is set', () => {
    const guard = new RolesGuard(buildReflector({ isPublic: false }));

    expect(
      guard.canActivate(buildContext({ role: Role.Employee })),
    ).toBe(true);
  });

  it('allows the request when the user role is in the required list', () => {
    const guard = new RolesGuard(
      buildReflector({ roles: [Role.Administrator, Role.TeamLead] }),
    );

    expect(
      guard.canActivate(buildContext({ role: Role.TeamLead })),
    ).toBe(true);
  });

  it('rejects the request when the user role is not in the required list', () => {
    const guard = new RolesGuard(
      buildReflector({ roles: [Role.Administrator] }),
    );

    expect(() =>
      guard.canActivate(buildContext({ role: Role.Employee })),
    ).toThrow(ForbiddenException);
  });

  it('rejects (rather than crashing) if somehow no user is on the request', () => {
    const guard = new RolesGuard(
      buildReflector({ roles: [Role.Administrator] }),
    );

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects (fails closed) when @Roles() is applied with an empty list', () => {
    // An empty @Roles() is near-certain decorator misuse (nobody means
    // to write "restricted to nobody") — it must not be silently treated
    // the same as "no @Roles() at all" (which allows any authenticated
    // user through).
    const guard = new RolesGuard(buildReflector({ roles: [] }));

    expect(() =>
      guard.canActivate(buildContext({ role: Role.Administrator })),
    ).toThrow(ForbiddenException);
  });
});
