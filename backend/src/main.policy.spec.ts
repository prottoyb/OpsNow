import { resolveLogLevels, resolveSwaggerEnabled } from './main.policy';

/**
 * These two decide what a production deployment exposes, so they are tested
 * rather than left as inline expressions in `bootstrap()` — which cannot be
 * tested at all without starting an application and a database.
 */
describe('resolveLogLevels', () => {
  it('drops debug and verbose in production', () => {
    const levels = resolveLogLevels('production');

    expect(levels).toEqual(['error', 'warn', 'log']);
    expect(levels).not.toContain('debug');
    expect(levels).not.toContain('verbose');
  });

  it.each([['development'], ['test'], [undefined]])(
    'keeps every level when NODE_ENV is %s',
    (nodeEnv) => {
      expect(resolveLogLevels(nodeEnv)).toEqual([
        'error',
        'warn',
        'log',
        'debug',
        'verbose',
      ]);
    },
  );

  it('always keeps error and warn', () => {
    for (const nodeEnv of ['production', 'development', 'test', undefined]) {
      const levels = resolveLogLevels(nodeEnv);
      expect(levels).toContain('error');
      expect(levels).toContain('warn');
    }
  });
});

describe('resolveSwaggerEnabled', () => {
  it('is off in production unless explicitly switched on', () => {
    expect(resolveSwaggerEnabled('production', undefined)).toBe(false);
  });

  it('is on outside production without any configuration', () => {
    expect(resolveSwaggerEnabled('development', undefined)).toBe(true);
    expect(resolveSwaggerEnabled('test', undefined)).toBe(true);
    expect(resolveSwaggerEnabled(undefined, undefined)).toBe(true);
  });

  it('honours an explicit setting in either direction', () => {
    // Opting in to publishing the full API surface in production is allowed,
    // but it has to be said out loud.
    expect(resolveSwaggerEnabled('production', true)).toBe(true);
    // And it can be turned off in development too, e.g. on a shared box.
    expect(resolveSwaggerEnabled('development', false)).toBe(false);
  });
});
