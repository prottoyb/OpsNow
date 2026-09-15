import { ApiError } from './errors';

/**
 * Relative on purpose. The browser must see the API on its own origin: the
 * backend enables no CORS, `/auth/refresh` and `/auth/logout` reject a
 * cross-origin `Origin` header, and the refresh cookie is `SameSite=Strict`.
 * The Vite dev/preview proxy (see `vite.config.ts`) is what makes that true
 * in development. There is deliberately no env override.
 */
const API_BASE_URL = '/api/v1';

const REQUEST_TIMEOUT_MS = 20_000;

/** Name of the Web Locks mutex that serializes refresh across browser tabs. */
const REFRESH_LOCK_NAME = 'opsnow-refresh';

/**
 * The access token lives here and nowhere else — never localStorage,
 * sessionStorage, a JS-written cookie, or a URL. It is a 15-minute JWT; the
 * long-lived credential is the httpOnly refresh cookie, which JavaScript
 * cannot read. A page reload therefore starts with no token and recovers
 * the session through the bootstrap refresh in `AuthContext`.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

type SessionExpiredHandler = () => void;

let sessionExpiredHandler: SessionExpiredHandler | null = null;

/**
 * Called when a refresh attempt fails, i.e. the session is genuinely over.
 * `AuthContext` wires this up to clear the token, clear the TanStack Query
 * cache and redirect to `/login` with a session-expired notice.
 */
export function setSessionExpiredHandler(
  handler: SessionExpiredHandler | null,
): void {
  sessionExpiredHandler = handler;
}

function notifySessionExpired(): void {
  accessToken = null;
  sessionExpiredHandler?.();
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /**
   * Suppresses the refresh-and-retry behaviour. Set for the auth endpoints
   * themselves: a 401 from `/auth/refresh` *is* the failure, and retrying
   * `/auth/login` after a refresh is meaningless.
   */
  skipAuthRefresh?: boolean;
}

function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  let url = `${API_BASE_URL}${path}`;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    }
    const search = params.toString();
    if (search) {
      url = `${url}?${search}`;
    }
  }

  // Resolved against the app's own origin, which is exactly what the bare
  // relative URL already means in a browser. Spelled out because Node's
  // `fetch` (used by jsdom under Vitest) rejects a relative URL outright,
  // and because it makes the same-origin requirement explicit.
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(url, window.location.origin).toString();
  }
  return url;
}

async function sendRequest(
  path: string,
  options: ApiRequestOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onCallerAbort);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      // Sends the httpOnly refresh cookie. Same-origin in practice, but
      // explicit so a proxy/base-URL change can never silently drop it.
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw ApiError.network(error);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  try {
    const text = await response.text();
    return text === '' ? undefined : (JSON.parse(text) as unknown);
  } catch {
    // A non-JSON body (proxy error page, truncated response) must not crash
    // the caller; ApiError falls back to a generic message.
    return undefined;
  }
}

async function toResult<T>(response: Response): Promise<T> {
  const body = await readBody(response);
  if (!response.ok) {
    throw ApiError.fromResponse(response.status, body);
  }
  return body as T;
}

/* ------------------------------------------------------------------ */
/* Refresh coordination                                                */
/* ------------------------------------------------------------------ */

/** In-tab single flight: every concurrent 401 awaits this one promise. */
let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  try {
    const result = await sendRequest('/auth/refresh', {
      method: 'POST',
      skipAuthRefresh: true,
    });
    if (!result.ok) {
      return null;
    }
    const body = (await readBody(result)) as { accessToken?: string } | undefined;
    if (!body?.accessToken) {
      return null;
    }
    accessToken = body.accessToken;
    return accessToken;
  } catch {
    return null;
  }
}

/**
 * Serializes refresh across browser tabs via the Web Locks API.
 *
 * This matters because of the backend's refresh-token theft detection
 * (`backend/src/auth/auth.service.ts`): presenting a refresh token that has
 * **already been rotated** revokes the user's entire token family and forces
 * a logout. Genuinely simultaneous refreshes are absorbed by the service's
 * conditional update and merely return 401 — the family revocation comes
 * from a *serialized but stale* presentation, which is exactly what a second
 * tab (or a queued retry firing after another refresh completed) produces.
 * Holding a cross-tab mutex means the waiting tab only ever presents the
 * cookie the winner just rotated in, never the one it superseded.
 *
 * Feature detection is mandatory, not defensive decoration: `navigator.locks`
 * is undefined under jsdom and absent outside a secure context. When it is
 * unavailable the plain in-tab single flight is used instead — authentication
 * still works end to end; only cross-tab coordination is lost.
 */
async function withCrossTabLock<T>(run: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;

  if (!locks || typeof locks.request !== 'function') {
    return run();
  }

  // Distinguishes "the Lock Manager was unusable" from "the work threw":
  // only the former may be retried without the lock, or the refresh would
  // run twice and trip the very reuse detection this exists to avoid.
  let started = false;
  try {
    return (await locks.request(REFRESH_LOCK_NAME, async () => {
      started = true;
      return run();
    })) as T;
  } catch (error) {
    if (started) {
      throw error;
    }
    return run();
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = withCrossTabLock(performRefresh).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Explicit session bootstrap. On a cold page load there is no access token
 * in memory (by design — see above), only the httpOnly refresh cookie, so
 * the session is recovered by exchanging it once. Shares the same
 * single-flight promise and cross-tab lock as the 401 path, so a bootstrap
 * racing an in-flight refresh cannot double-present the cookie.
 *
 * Returns true when a token was obtained.
 */
export async function refreshSession(): Promise<boolean> {
  return (await refreshAccessToken()) !== null;
}

/** Test-only reset so one spec's in-flight refresh cannot leak into the next. */
export function resetApiClientForTests(): void {
  accessToken = null;
  refreshInFlight = null;
  sessionExpiredHandler = null;
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await sendRequest(path, options);

  if (response.status !== 401 || options.skipAuthRefresh) {
    return toResult<T>(response);
  }

  const token = await refreshAccessToken();
  if (!token) {
    notifySessionExpired();
    throw ApiError.fromResponse(401, await readBody(response));
  }

  // Exactly one retry. A second 401 means the freshly-minted token was
  // already rejected, so the session is over — never refresh again here,
  // which is what would turn this into a loop.
  const retried = await sendRequest(path, options);
  if (retried.status === 401) {
    notifySessionExpired();
  }
  return toResult<T>(retried);
}
