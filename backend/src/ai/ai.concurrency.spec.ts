import { ConcurrencyLimiter } from './ai.concurrency';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ConcurrencyLimiter', () => {
  it('runs up to the cap and refuses the next call as busy without queueing', async () => {
    const limiter = new ConcurrencyLimiter(2);
    const gate = deferred();
    const first = limiter.run(() => gate.promise);
    const second = limiter.run(() => gate.promise);

    expect(limiter.active).toBe(2);
    await expect(limiter.run(() => Promise.resolve(1))).rejects.toMatchObject({ reason: 'busy' });

    gate.resolve();
    await Promise.all([first, second]);
    expect(limiter.active).toBe(0);
  });

  it('frees the slot when the work fails', async () => {
    const limiter = new ConcurrencyLimiter(1);
    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(limiter.active).toBe(0);
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('accepts a call again once a slot is released', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const gate = deferred();
    const held = limiter.run(() => gate.promise);
    await expect(limiter.run(() => Promise.resolve())).rejects.toMatchObject({ reason: 'busy' });
    gate.resolve();
    await held;
    await expect(limiter.run(() => Promise.resolve('again'))).resolves.toBe('again');
  });
});
