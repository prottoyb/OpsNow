import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('does not throw on startup when the database is unreachable', async () => {
    const service = new PrismaService();
    jest
      .spyOn(service, '$connect')
      .mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('disconnects on module destroy', async () => {
    const service = new PrismaService();
    const disconnectSpy = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
