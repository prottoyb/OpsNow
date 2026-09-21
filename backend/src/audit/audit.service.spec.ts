import { ForbiddenException, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { AuditOutcome } from './audit.constants';
import { AuditEvent, loginFailed, loginSucceeded } from './audit.events';
import { AuditService } from './audit.service';

const SENTINEL_PASSWORD = 'Sentinel-P@ssw0rd-9f3a';
const SENTINEL_BEARER = 'Bearer sentinel-access-token-abc123';

function user(role: Role): AuthenticatedUser {
  return { id: 'u1', email: 'x@y.z', role };
}

describe('AuditService', () => {
  let prisma: {
    auditLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let service: AuditService;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new AuditService(prisma as unknown as PrismaService);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('record', () => {
    it('persists the event with outcome folded into metadata', async () => {
      await service.record(
        loginSucceeded('u1', { ipAddress: '203.0.113.9', userAgent: 'jest' }),
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'u1',
          action: 'auth.login.succeeded',
          entityType: 'User',
          entityId: 'u1',
          metadata: { outcome: AuditOutcome.Success },
          ipAddress: '203.0.113.9',
          userAgent: 'jest',
        },
      });
    });

    it('never persists a secret smuggled into an event, and warns with key names only', async () => {
      const hostile = {
        ...loginFailed('a@b.co', 'bad_password', null, {}),
        metadata: {
          reason: SENTINEL_BEARER,
          password: SENTINEL_PASSWORD,
          authorization: SENTINEL_BEARER,
        },
      } as unknown as AuditEvent;

      await service.record(hostile);

      const written = JSON.stringify(prisma.auditLog.create.mock.calls);
      expect(written).not.toContain(SENTINEL_PASSWORD);
      expect(written).not.toContain('sentinel-access-token');
      const warned = JSON.stringify(warnSpy.mock.calls);
      expect(warned).toContain('password');
      expect(warned).not.toContain(SENTINEL_PASSWORD);
    });

    it('drops an unparseable IP rather than failing the insert', async () => {
      await service.record(loginSucceeded('u1', { ipAddress: 'garbage' }));
      expect(prisma.auditLog.create.mock.calls[0][0].data.ipAddress).toBeNull();
    });

    it('does not propagate a write failure, and logs it without the payload', async () => {
      prisma.auditLog.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          `Invocation: data: { password: "${SENTINEL_PASSWORD}" }`,
          { code: 'P2003', clientVersion: 'test' },
        ),
      );

      await expect(
        service.record(loginSucceeded('u1', {})),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = String(errorSpy.mock.calls[0][0]);
      expect(logged).toContain('auth.login.succeeded');
      expect(logged).toContain('P2003');
      expect(logged).not.toContain(SENTINEL_PASSWORD);
    });

    it('does not propagate a non-Prisma failure either', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('connection lost'));
      await expect(
        service.record(loginSucceeded('u1', {})),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it.each([Role.Employee, Role.SupportAgent, Role.TeamLead])(
      'refuses %s (defence in depth beyond @Roles)',
      async (role) => {
        await expect(
          service.findAll({ limit: 20, offset: 0 }, user(role)),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
      },
    );

    it('lets an Administrator through, filtering, paging and newest-first', async () => {
      prisma.auditLog.count.mockResolvedValue(1);
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'r1',
          actorId: 'u1',
          action: 'auth.login.succeeded',
          entityType: 'User',
          entityId: 'u1',
          metadata: { outcome: 'success' },
          ipAddress: '203.0.113.9',
          userAgent: 'jest',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          actor: {
            id: 'u1',
            firstName: 'A',
            lastName: 'B',
            role: Role.Administrator,
            email: 'must-not-leak@x.y',
            passwordHash: 'must-not-leak',
          },
        },
      ]);

      const result = await service.findAll(
        { limit: 5, offset: 10, actorId: 'u1' },
        user(Role.Administrator),
      );

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { AND: [{ actorId: 'u1' }] },
        include: { actor: true },
        take: 5,
        skip: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(result.total).toBe(1);
      expect(result.data[0].outcome).toBe('success');
      expect(result.data[0].actor).toEqual({
        id: 'u1',
        firstName: 'A',
        lastName: 'B',
        role: Role.Administrator,
      });
      expect(JSON.stringify(result)).not.toContain('must-not-leak');
    });
  });
});
