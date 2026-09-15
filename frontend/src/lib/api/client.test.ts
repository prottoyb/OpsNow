import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { mockState } from '../../mocks/handlers';
import {
  apiFetch,
  getAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
  withCrossTabLock,
} from './client';
import { ApiError } from './errors';

const BASE = '*/api/v1';

/**
 * jsdom does not implement the Web Locks API, so `navigator.locks` is
 * undefined by default — that is the fallback path. Installing a minimal
 * but faithful LockManager (one exclusive holder at a time, serialized)
 * exercises the locked path.
 */
function installFakeLockManager(): { requests: string[] } {
  const requests: string[] = [];
  let chain: Promise<unknown> = Promise.resolve();

  const lockManager = {
    request: (name: string, callback: () => Promise<unknown>) => {
      requests.push(name);
      const run = chain.then(() => callback());
      // Keep the chain alive even if this holder rejects.
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  Object.defineProperty(navigator, 'locks', {
    value: lockManager,
    configurable: true,
  });

  return { requests };
}

function removeLockManager(): void {
  Object.defineProperty(navigator, 'locks', {
    value: undefined,
    configurable: true,
  });
}

afterEach(() => {
  removeLockManager();
});

describe('apiFetch — happy path', () => {
  it('sends the in-memory access token as a bearer header', async () => {
    setAccessToken(mockState.accessToken);
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/tickets`, ({ request }) => {
        seen.push(request.headers.get('Authorization'));
        return HttpResponse.json({ data: [], total: 0 });
      }),
    );

    await apiFetch('/tickets');

    expect(seen).toEqual([`Bearer ${mockState.accessToken}`]);
  });

  it('serializes query parameters and omits undefined ones', async () => {
    setAccessToken(mockState.accessToken);
    let requestUrl = '';
    server.use(
      http.get(`${BASE}/tickets`, ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({ data: [], total: 0 });
      }),
    );

    await apiFetch('/tickets', {
      query: { status: 'Open', priority: undefined, limit: 20, offset: 0 },
    });

    const url = new URL(requestUrl);
    expect(url.searchParams.get('status')).toBe('Open');
    expect(url.searchParams.has('priority')).toBe(false);
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('offset')).toBe('0');
  });

  it('returns undefined for a 204 response without attempting to parse it', async () => {
    server.use(
      http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    await expect(
      apiFetch('/auth/logout', { method: 'POST', skipAuthRefresh: true }),
    ).resolves.toBeUndefined();
  });
});

describe('apiFetch — error normalization', () => {
  it('normalizes a string message', async () => {
    setAccessToken(mockState.accessToken);
    server.use(
      http.get(`${BASE}/tickets/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 404,
            timestamp: 't',
            path: '/p',
            message: 'Ticket not found',
          },
          { status: 404 },
        ),
      ),
    );

    const error = await apiFetch('/tickets/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).messages).toEqual(['Ticket not found']);
    expect((error as ApiError).isNotFound).toBe(true);
  });

  it('normalizes a class-validator string[] message', async () => {
    setAccessToken(mockState.accessToken);
    server.use(
      http.post(`${BASE}/tickets`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            timestamp: 't',
            path: '/p',
            message: [
              'subject should not be empty',
              'description must be shorter than or equal to 10000 characters',
            ],
          },
          { status: 400 },
        ),
      ),
    );

    const error = (await apiFetch('/tickets', {
      method: 'POST',
      body: {},
    }).catch((e: unknown) => e)) as ApiError;

    expect(error.isValidationError).toBe(true);
    expect(error.messages).toHaveLength(2);
    expect(error.messages[0]).toBe('subject should not be empty');
  });

  it('never surfaces a 5xx body to the UI', async () => {
    setAccessToken(mockState.accessToken);
    server.use(
      http.get(`${BASE}/tickets`, () =>
        HttpResponse.json(
          { statusCode: 500, message: 'connect ECONNREFUSED 127.0.0.1:5432' },
          { status: 500 },
        ),
      ),
    );

    const error = (await apiFetch('/tickets').catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(500);
    expect(error.messages).toEqual(['Something went wrong. Please try again.']);
  });

  it('turns a transport failure into a network ApiError', async () => {
    setAccessToken(mockState.accessToken);
    server.use(http.get(`${BASE}/tickets`, () => HttpResponse.error()));

    const error = (await apiFetch('/tickets').catch((e: unknown) => e)) as ApiError;

    expect(error.isNetworkError).toBe(true);
    expect(error.messages[0]).toMatch(/could not reach the server/i);
  });

  it('falls back to a generic message when the body is not JSON', async () => {
    setAccessToken(mockState.accessToken);
    server.use(
      http.get(`${BASE}/tickets`, () =>
        HttpResponse.text('<html>502 Bad Gateway</html>', { status: 400 }),
      ),
    );

    const error = (await apiFetch('/tickets').catch((e: unknown) => e)) as ApiError;

    expect(error.messages).toEqual(['Something went wrong. Please try again.']);
  });
});

describe('apiFetch — single-flight refresh on 401', () => {
  /** Expires the token the mock server currently accepts. */
  function expireAccessToken(): void {
    setAccessToken('stale-token');
  }

  it('performs exactly ONE refresh for many concurrent 401s', async () => {
    expireAccessToken();

    const results = await Promise.all([
      apiFetch<{ total: number }>('/tickets'),
      apiFetch<{ total: number }>('/tickets'),
      apiFetch<{ total: number }>('/tickets'),
      apiFetch<{ total: number }>('/tickets'),
    ]);

    expect(mockState.refreshCount).toBe(1);
    expect(results).toHaveLength(4);
    expect(getAccessToken()).toBe(mockState.accessToken);
  });

  it('retries the original request exactly once after a successful refresh', async () => {
    expireAccessToken();
    let ticketCalls = 0;
    server.use(
      http.get(`${BASE}/tickets`, ({ request }) => {
        ticketCalls += 1;
        const header = request.headers.get('Authorization');
        if (header !== `Bearer ${mockState.accessToken}`) {
          return HttpResponse.json(
            { statusCode: 401, message: 'Unauthorized' },
            { status: 401 },
          );
        }
        return HttpResponse.json({ data: [], total: 0 });
      }),
    );

    await apiFetch('/tickets');

    expect(ticketCalls).toBe(2);
    expect(mockState.refreshCount).toBe(1);
  });

  it('does not refresh a second time when the retry also returns 401', async () => {
    expireAccessToken();
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    server.use(
      http.get(`${BASE}/tickets`, () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    );

    await expect(apiFetch('/tickets')).rejects.toBeInstanceOf(ApiError);

    expect(mockState.refreshCount).toBe(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('clears the session and notifies when the refresh itself fails', async () => {
    expireAccessToken();
    mockState.refreshSucceeds = false;
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);

    const error = (await apiFetch('/tickets').catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(401);
    expect(getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh for an auth endpoint', async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(
          { statusCode: 401, message: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    );

    await expect(
      apiFetch('/auth/me', { skipAuthRefresh: true }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(mockState.refreshCount).toBe(0);
  });

  it('allows a fresh refresh after an earlier one settled', async () => {
    expireAccessToken();
    await apiFetch('/tickets');
    expect(mockState.refreshCount).toBe(1);

    setAccessToken('stale-again');
    await apiFetch('/tickets');

    expect(mockState.refreshCount).toBe(2);
  });
});

describe('apiFetch — cross-tab refresh coordination', () => {
  it('uses navigator.locks when the Web Locks API is available', async () => {
    const { requests } = installFakeLockManager();
    setAccessToken('stale-token');

    await Promise.all([apiFetch('/tickets'), apiFetch('/tickets')]);

    expect(requests).toEqual(['opsnow-refresh']);
    expect(mockState.refreshCount).toBe(1);
  });

  it('works with the in-memory fallback when navigator.locks is undefined', async () => {
    removeLockManager();
    expect(
      (navigator as Navigator & { locks?: LockManager }).locks,
    ).toBeUndefined();
    setAccessToken('stale-token');

    const results = await Promise.all([
      apiFetch<{ total: number }>('/tickets'),
      apiFetch<{ total: number }>('/tickets'),
      apiFetch<{ total: number }>('/tickets'),
    ]);

    expect(mockState.refreshCount).toBe(1);
    expect(results).toHaveLength(3);
  });

  it('falls back to an unlocked refresh when the Lock Manager itself throws', async () => {
    Object.defineProperty(navigator, 'locks', {
      value: {
        request: () => {
          throw new Error('SecurityError: locks unavailable');
        },
      },
      configurable: true,
    });
    setAccessToken('stale-token');

    await apiFetch('/tickets');

    expect(mockState.refreshCount).toBe(1);
  });

  it('does not re-run the refresh when the refresh itself fails inside the lock', async () => {
    installFakeLockManager();
    setAccessToken('stale-token');
    mockState.refreshSucceeds = false;

    await expect(apiFetch('/tickets')).rejects.toBeInstanceOf(ApiError);

    // Exactly one attempt: a failure inside the lock must not be mistaken
    // for the Lock Manager being unusable.
    expect(mockState.refreshCount).toBe(1);
  });
});

/**
 * Tested directly rather than through `apiFetch`, because `performRefresh`
 * catches everything it calls — so via that route the "work threw" branch is
 * unreachable and a test asserting on it would pass even with the guard
 * removed. The distinction matters: a Lock Manager that failed before running
 * the callback must be retried without the lock, while work that threw inside
 * the lock must NOT be retried, or the refresh would run twice and trip the
 * token-reuse detection this whole mechanism exists to avoid.
 */
describe('withCrossTabLock', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('runs the work unlocked when the Lock Manager is unavailable', async () => {
    expect(navigator.locks).toBeUndefined();
    await expect(withCrossTabLock(async () => 'ran')).resolves.toBe('ran');
  });

  it('propagates a failure from inside the lock without re-running it', async () => {
    let runs = 0;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (_name: string, callback: () => Promise<unknown>) =>
          callback(),
      },
    });

    await expect(
      withCrossTabLock(async () => {
        runs += 1;
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');

    expect(runs).toBe(1);
  });

  it('falls back to running unlocked when the Lock Manager rejects asynchronously', async () => {
    let runs = 0;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        // Rejects WITHOUT invoking the callback, the shape a real Web Locks
        // failure takes (a rejected promise, not a synchronous throw).
        request: () =>
          Promise.reject(new DOMException('lock unavailable', 'NotSupportedError')),
      },
    });

    const result = await withCrossTabLock(async () => {
      runs += 1;
      return 'ran unlocked';
    });

    expect(result).toBe('ran unlocked');
    expect(runs).toBe(1);
  });
});
