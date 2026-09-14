import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { UsersService } from '../../users/users.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let usersService: { findById: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    usersService = { findById: jest.fn() };
    const configService = {
      getOrThrow: jest.fn(() => 'a-test-secret-that-is-long-enough-12345'),
    };
    strategy = new JwtStrategy(
      configService as unknown as ConfigService,
      usersService as unknown as UsersService,
    );
  });

  it('returns the authenticated user for a valid, active user', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'jane@opsnow.local',
      role: Role.Employee,
      isActive: true,
    });

    const result = await strategy.validate({
      sub: 'user-1',
      email: 'jane@opsnow.local',
      role: Role.Employee,
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'jane@opsnow.local',
      role: Role.Employee,
    });
  });

  it('rejects when the user no longer exists (or is soft-deleted)', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'ghost',
        email: 'ghost@opsnow.local',
        role: Role.Employee,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user has been deactivated', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'jane@opsnow.local',
      role: Role.Employee,
      isActive: false,
    });

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'jane@opsnow.local',
        role: Role.Employee,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
