import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

function buildContext(): ExecutionContext {
  const handler = function handler() {};
  const controller = class Controller {};
  return {
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows a @Public() route without delegating to the passport check', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('falls through to the passport check for a non-public route', async () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const context = buildContext();

    const passportProto = Object.getPrototypeOf(Object.getPrototypeOf(guard));
    const superCanActivate = jest
      .spyOn(passportProto, 'canActivate')
      .mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(superCanActivate).toHaveBeenCalledWith(context);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    superCanActivate.mockRestore();
  });
});
