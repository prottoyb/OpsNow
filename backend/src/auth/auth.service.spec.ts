import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'jane@opsnow.local',
    passwordHash: '',
    firstName: 'Jane',
    lastName: 'Doe',
    role: Role.Employee,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: {
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    touchLastLogin: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      touchLastLogin: jest.fn(),
    };
    jwtService = { sign: jest.fn(() => 'signed.jwt.token') };
    configService = { get: jest.fn((_key: string, def?: unknown) => def) };

    service = new AuthService(
      prisma as unknown as PrismaService,
      usersService as unknown as UsersService,
      jwtService as any,
      configService as any,
    );
  });

  describe('register', () => {
    it('hashes the password with argon2id and returns only safe fields', async () => {
      usersService.create.mockImplementation(async (input) =>
        buildUser({ email: input.email, passwordHash: input.passwordHash }),
      );

      const result = await service.register({
        email: 'Jane@OpsNow.local',
        password: 'S3curePass!',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(usersService.create).toHaveBeenCalledTimes(1);
      const passedHash = usersService.create.mock.calls[0][0].passwordHash;
      expect(passedHash).not.toBe('S3curePass!');
      await expect(
        argon2.verify(passedHash, 'S3curePass!'),
      ).resolves.toBe(true);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('translates a Prisma unique-constraint violation into 409', async () => {
      usersService.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.register({
          email: 'jane@opsnow.local',
          password: 'S3curePass!',
          firstName: 'Jane',
          lastName: 'Doe',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('rejects an unknown email with the same generic message a wrong password gets', async () => {
      // Also exercises the timing-safety path: login() runs a real
      // argon2.verify against a dummy hash here rather than short-
      // circuiting, so this call is not instant (argon2 is a native
      // binding and can't be spied on to assert this directly).
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'ghost@opsnow.local', password: 'whatever123' },
          {},
        ),
      ).rejects.toMatchObject({
        message: 'Invalid email or password',
      });
    });

    it('rejects a wrong password with the same generic message', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      await expect(
        service.login(
          { email: 'jane@opsnow.local', password: 'wrong-password' },
          {},
        ),
      ).rejects.toMatchObject({ message: 'Invalid email or password' });
    });

    it('rejects a correct password for a disabled account', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      usersService.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, isActive: false }),
      );

      await expect(
        service.login(
          { email: 'jane@opsnow.local', password: 'correct-password' },
          {},
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('issues tokens and touches lastLoginAt on success', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash }));
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(
        { email: 'jane@opsnow.local', password: 'correct-password' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      );

      expect(usersService.touchLastLogin).toHaveBeenCalledWith('user-1');
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });
  });

  describe('refresh', () => {
    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('nonexistent', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('expired', {})).rejects.toMatchObject({
        message: 'Refresh token expired',
      });
    });

    it('rejects a valid token when its user no longer exists (deleted)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      usersService.findById.mockResolvedValue(null);

      await expect(service.refresh('valid-but-orphaned', {})).rejects.toMatchObject(
        { message: 'Invalid refresh token' },
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a valid token when its user has been deactivated', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      usersService.findById.mockResolvedValue(buildUser({ isActive: false }));

      await expect(service.refresh('valid-but-disabled', {})).rejects.toMatchObject(
        { message: 'Invalid refresh token' },
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('treats a reused already-rotated token as theft and revokes the whole family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        replacedById: 'rt-2',
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.refresh('stolen', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects a merely-revoked (not reused) token without a family revoke', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.refresh('revoked', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rotates atomically: revokes the old token and issues a new one', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      usersService.findById.mockResolvedValue(buildUser());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh('valid-raw-token', {});

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: expect.objectContaining({ replacedById: expect.any(String) }),
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('rejects when it loses the rotation race, rolling back via the transaction', async () => {
      // The child row is created before the conditional parent update
      // (a DB foreign-key constraint requires replacedById to point at
      // an existing row) — so create() is attempted here, but in real
      // Postgres the transaction (and this mock's $transaction wrapper
      // both run under the same try/catch) rolls it back along with
      // everything else when the conditional update below reports it
      // lost the race. What matters is that the whole rotation is
      // rejected, not silently treated as a success.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      usersService.findById.mockResolvedValue(buildUser());
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('raced-token', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: expect.objectContaining({ replacedById: expect.any(String) }),
      });
    });
  });

  describe('logout', () => {
    it('revokes only the matching, still-active token', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('some-raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
