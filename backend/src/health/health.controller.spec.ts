import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };
  let prismaIndicator: { pingCheck: jest.Mock };

  beforeEach(async () => {
    healthCheckService = { check: jest.fn() };
    prismaIndicator = { pingCheck: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PrismaHealthIndicator, useValue: prismaIndicator },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('runs the check through HealthCheckService with the Prisma indicator', async () => {
    const expected = { status: 'ok', info: {}, error: {}, details: {} };
    healthCheckService.check.mockImplementation(
      async (indicators: Array<() => unknown>) => {
        await Promise.all(indicators.map((indicator) => indicator()));
        return expected;
      },
    );
    prismaIndicator.pingCheck.mockResolvedValue({
      database: { status: 'up' },
    });

    const result = await controller.check();

    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    expect(prismaIndicator.pingCheck).toHaveBeenCalledWith(
      'database',
      expect.anything(),
    );
    expect(result).toBe(expected);
  });
});
