import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail, UsersService } from './users.service';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jane.Doe@OpsNow.Local  ')).toBe(
      'jane.doe@opsnow.local',
    );
  });
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
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
});
