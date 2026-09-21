import {
  REDACTED,
  sanitizeIp,
  sanitizeLoginIdentifier,
  sanitizeMetadata,
  sanitizeUserAgent,
} from './audit.sanitize';

// Sentinels: distinctive fakes we then hunt for in serialised output.
const SENTINEL_PASSWORD = 'Sentinel-P@ssw0rd-9f3a';
const SENTINEL_BEARER = 'Bearer sentinel-access-token-abc123';
const SENTINEL_JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZW50aW5lbCJ9.c2VudGluZWwtc2ln';
const SENTINEL_REFRESH = 'ab12'.repeat(32); // 128 hex chars, like a real one
const SENTINEL_API_KEY = 'sk-sentinel-api-key-777';
const SENTINEL_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaGhhc2g';

function serialised(value: unknown): string {
  return JSON.stringify(value);
}

describe('sanitizeMetadata', () => {
  it('drops every non-allow-listed key, whatever it is called', () => {
    const { metadata, droppedKeys } = sanitizeMetadata({
      outcome: 'failure',
      password: SENTINEL_PASSWORD,
      passwordHash: SENTINEL_HASH,
      accessToken: SENTINEL_JWT,
      refreshToken: SENTINEL_REFRESH,
      authorization: SENTINEL_BEARER,
      cookie: `refresh_token=${SENTINEL_REFRESH}`,
      apiKey: SENTINEL_API_KEY,
      body: { password: SENTINEL_PASSWORD },
    });

    expect(metadata).toEqual({ outcome: 'failure' });
    expect(droppedKeys.sort()).toEqual(
      [
        'accessToken',
        'apiKey',
        'authorization',
        'body',
        'cookie',
        'passwordHash',
        'password',
        'refreshToken',
      ].sort(),
    );
    const out = serialised(metadata);
    for (const s of [
      SENTINEL_PASSWORD,
      SENTINEL_JWT,
      SENTINEL_REFRESH,
      SENTINEL_API_KEY,
      SENTINEL_HASH,
    ]) {
      expect(out).not.toContain(s);
    }
  });

  it('redacts secret-shaped VALUES even under an allow-listed key', () => {
    const { metadata } = sanitizeMetadata({
      reason: SENTINEL_BEARER,
      from: SENTINEL_JWT,
      to: SENTINEL_REFRESH,
      route: SENTINEL_HASH,
      changedFields: [SENTINEL_BEARER, 'subject'],
    });

    expect(metadata).toEqual({
      reason: REDACTED,
      from: REDACTED,
      to: REDACTED,
      route: REDACTED,
      changedFields: [REDACTED, 'subject'],
    });
  });

  it('drops nested objects under an allowed key so a request body cannot be smuggled in', () => {
    const { metadata, droppedKeys } = sanitizeMetadata({
      reason: { password: SENTINEL_PASSWORD },
      changedFields: [{ password: SENTINEL_PASSWORD }, 'ok'],
    });

    expect(droppedKeys).toContain('reason');
    expect(serialised(metadata)).not.toContain(SENTINEL_PASSWORD);
    expect(metadata.changedFields).toEqual(['ok']);
  });

  it('caps string length, strips control characters, keeps null and booleans', () => {
    const { metadata } = sanitizeMetadata({
      reason: `a\x00b\x1f${'x'.repeat(1000)}`,
      from: null,
    });

    expect(metadata.reason).toHaveLength(255);
    expect(metadata.reason).not.toMatch(/[\x00-\x1f]/);
    expect(metadata.from).toBeNull();
  });

  it('skips undefined values silently and drops non-finite numbers', () => {
    const { metadata, droppedKeys } = sanitizeMetadata({
      reason: undefined,
      from: Number.NaN,
    });
    expect(metadata).toEqual({});
    expect(droppedKeys).toEqual(['from']);
  });
});

describe('sanitizeLoginIdentifier', () => {
  it('keeps an email, lower-cased', () => {
    expect(sanitizeLoginIdentifier('  Jane@OpsNow.Local ')).toBe(
      'jane@opsnow.local',
    );
  });

  it('refuses anything that is not email-shaped (e.g. a pasted password)', () => {
    expect(sanitizeLoginIdentifier(SENTINEL_PASSWORD)).toBeNull();
    expect(sanitizeLoginIdentifier('has space@x.com')).toBeNull();
    expect(sanitizeLoginIdentifier(undefined)).toBeNull();
    expect(sanitizeLoginIdentifier({ a: 1 })).toBeNull();
  });

  it('refuses an oversized attacker-supplied string rather than storing it', () => {
    expect(sanitizeLoginIdentifier(`${'a'.repeat(300)}@x.com`)).toBeNull();
  });

  it('refuses a secret-shaped value that happens to contain an @', () => {
    expect(sanitizeLoginIdentifier(`${SENTINEL_REFRESH}@x.com`)).toBeNull();
  });
});

describe('sanitizeIp / sanitizeUserAgent', () => {
  it('accepts IPv4/IPv6, rejects junk (the column is inet)', () => {
    expect(sanitizeIp('203.0.113.9')).toBe('203.0.113.9');
    expect(sanitizeIp('::ffff:127.0.0.1')).toBe('::ffff:127.0.0.1');
    expect(sanitizeIp('not-an-ip')).toBeNull();
    expect(sanitizeIp(undefined)).toBeNull();
  });

  it('caps and cleans the user agent', () => {
    expect(sanitizeUserAgent(`ua\x00${'z'.repeat(2000)}`)).toHaveLength(512);
    expect(sanitizeUserAgent('   ')).toBeNull();
    expect(sanitizeUserAgent(undefined)).toBeNull();
  });
});
