import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizeEmail,
  toSafeUser,
  toUserSummary,
  UsersService,
} from './users.service';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jane.Doe@OpsNow.Local  ')).toBe(
      'jane.doe@opsnow.local',
    );
  });
});

describe('toSafeUser', () => {
  it('strips passwordHash and every other field down to the safe set', () => {
    const result = toSafeUser({
      id: 'user-1',
      email: 'jane@opsnow.local',
      passwordHash: 'super-secret-hash',
      firstName: 'Jane',
      lastName: 'Doe',
      role: Role.Employee,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as never);

    expect(result).toEqual({
      id: 'user-1',
      email: 'jane@opsnow.local',
      firstName: 'Jane',
      lastName: 'Doe',
      role: Role.Employee,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });
});

describe('toUserSummary', () => {
  it('strips email, passwordHash, and every other field down to the narrow set', () => {
    const result = toUserSummary({
      id: 'user-1',
      email: 'jane@opsnow.local',
      passwordHash: 'super-secret-hash',
      firstName: 'Jane',
      lastName: 'Doe',
      role: Role.SupportAgent,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as never);

    expect(result).toEqual({
      id: 'user-1',
      firstName: 'Jane',
      lastName: 'Doe',
      role: Role.SupportAgent,
    });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('passwordHash');
  });
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('findByEmail normalizes the email and excludes soft-deleted users', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await service.findByEmail('  Jane@Example.com ');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'jane@example.com', deletedAt: null },
    });
  });

  it('findById excludes soft-deleted users', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await service.findById('user-1');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', deletedAt: null },
    });
  });

  it('create normalizes the email before writing', async () => {
    prisma.user.create.mockResolvedValue({});

    await service.create({
      email: 'Jane@Example.com',
      passwordHash: 'hash',
      firstName: 'Jane',
      lastName: 'Doe',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'jane@example.com',
        passwordHash: 'hash',
        firstName: 'Jane',
        lastName: 'Doe',
      },
    });
  });

  it('touchLastLogin updates lastLoginAt', async () => {
    prisma.user.update.mockResolvedValue({});

    await service.touchLastLogin('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  describe('findAll', () => {
    it('paginates, excludes soft-deleted users, and returns safe fields only', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'jane@opsnow.local',
          passwordHash: 'secret',
          firstName: 'Jane',
          lastName: 'Doe',
          role: Role.Administrator,
        },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ limit: 20, offset: 0 });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        take: 20,
        skip: 0,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
      expect(result).toEqual({
        data: [
          {
            id: 'user-1',
            email: 'jane@opsnow.local',
            firstName: 'Jane',
            lastName: 'Doe',
            role: Role.Administrator,
          },
        ],
        total: 1,
      });
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });

    it('passes the requested limit/offset through unchanged', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ limit: 5, offset: 10 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, skip: 10 }),
      );
    });
  });
});
