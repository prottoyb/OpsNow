import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { RolesGuard } from './roles.guard';

function buildAudit() {
  return { record: jest.fn().mockResolvedValue(undefined) };
}

function guardFor(reflector: Reflector, audit = buildAudit()) {
  return new RolesGuard(reflector, audit as unknown as AuditService);
}

function buildContext(user?: { id?: string; role: Role }): ExecutionContext {
  const handler = function handler() {};
  const controller = class Controller {};
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: user && { id: 'user-1', ...user },
        method: 'GET',
        route: { path: '/api/v1/audit-logs' },
        ip: '203.0.113.9',
        headers: { 'user-agent': 'jest' },
      }),
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
  it('allows a @Public() route through, even if @Roles() is also (mistakenly) set', async () => {
    const guard = guardFor(
      buildReflector({ isPublic: true, roles: [Role.Administrator] }),
    );

    // No request.user at all — a @Public() route never runs through
    // JwtStrategy, so this must not throw trying to read a role off it.
    await expect(guard.canActivate(buildContext(undefined))).resolves.toBe(
      true,
    );
  });

  it('allows an authenticated user through when no @Roles() is set', async () => {
    const guard = guardFor(buildReflector({ isPublic: false }));

    await expect(
      guard.canActivate(buildContext({ role: Role.Employee })),
    ).resolves.toBe(true);
  });

  it('allows the request when the user role is in the required list', async () => {
    const guard = guardFor(
      buildReflector({ roles: [Role.Administrator, Role.TeamLead] }),
    );

    await expect(
      guard.canActivate(buildContext({ role: Role.TeamLead })),
    ).resolves.toBe(true);
  });

  it('rejects the request when the user role is not in the required list', async () => {
    const guard = guardFor(buildReflector({ roles: [Role.Administrator] }));

    await expect(
      guard.canActivate(buildContext({ role: Role.Employee })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects (rather than crashing) if somehow no user is on the request', async () => {
    const guard = guardFor(buildReflector({ roles: [Role.Administrator] }));

    await expect(guard.canActivate(buildContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects (fails closed) when @Roles() is applied with an empty list', async () => {
    // An empty @Roles() is near-certain decorator misuse (nobody means
    // to write "restricted to nobody") — it must not be silently treated
    // the same as "no @Roles() at all" (which allows any authenticated
    // user through).
    const guard = guardFor(buildReflector({ roles: [] }));

    await expect(
      guard.canActivate(buildContext({ role: Role.Administrator })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records an access.denied audit event for an authenticated refusal', async () => {
    const audit = buildAudit();
    const guard = guardFor(
      buildReflector({ roles: [Role.Administrator] }),
      audit,
    );

    await expect(
      guard.canActivate(buildContext({ role: Role.Employee })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(audit.record).toHaveBeenCalledTimes(1);
    const event = audit.record.mock.calls[0][0];
    expect(event.action).toBe('access.denied');
    expect(event.actorId).toBe('user-1');
    expect(event.metadata).toEqual({
      actorRole: 'Employee',
      requiredRoles: ['Administrator'],
      method: 'GET',
      route: '/api/v1/audit-logs',
    });
  });

  it('records nothing when there is no authenticated user', async () => {
    const audit = buildAudit();
    const guard = guardFor(
      buildReflector({ roles: [Role.Administrator] }),
      audit,
    );

    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records nothing on an allowed request', async () => {
    const audit = buildAudit();
    const guard = guardFor(
      buildReflector({ roles: [Role.Administrator] }),
      audit,
    );

    await guard.canActivate(buildContext({ role: Role.Administrator }));
    expect(audit.record).not.toHaveBeenCalled();
  });
});
