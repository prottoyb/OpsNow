import { isIP } from 'node:net';
import {
  ALLOWED_METADATA_KEYS,
  MAX_METADATA_STRING_LENGTH,
  MAX_USER_AGENT_LENGTH,
} from './audit.constants';

export type MetadataScalar = string | number | boolean | null;
export type MetadataValue = MetadataScalar | MetadataScalar[];
export type SanitizedMetadata = Record<string, MetadataValue>;

export const REDACTED = '[redacted]';

// C0/C1 control characters and DEL, written with \x escapes so no raw
// control byte lives in this source file.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * Value-side patterns for things that must never be persisted even if a
 * caller mistakenly puts them under an allowed key: bearer credentials, JWTs,
 * argon2 hashes and long hex runs (refresh tokens are 128 hex chars, their
 * stored SHA-256 is 64).
 */
const SECRET_LIKE_VALUE: RegExp[] = [
  /^\s*(bearer|basic)\s+\S/i,
  /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/,
  /\$argon2/i,
  /[0-9a-f]{40,}/i,
];

function looksSecret(value: string): boolean {
  return SECRET_LIKE_VALUE.some((pattern) => pattern.test(value));
}

/** Strips control characters and caps length. */
export function cleanText(value: string, max: number): string {
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

function cleanScalar(value: unknown): MetadataScalar | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const cleaned = cleanText(value, MAX_METADATA_STRING_LENGTH);
    return looksSecret(cleaned) ? REDACTED : cleaned;
  }
  return undefined; // objects, functions, bigint, symbols: never persisted
}

/**
 * The structural guard behind the audit log's central security rule.
 *
 * It is an ALLOW-list on both axes:
 *  - keys: only ALLOWED_METADATA_KEYS survive, so a `password`, `token`,
 *    `authorization`, `body` or anything else a caller had lying around is
 *    dropped no matter how it is spelled;
 *  - values: only strings (control-stripped, length-capped), finite numbers,
 *    booleans, null, and flat arrays of those. Nested objects are dropped
 *    entirely, so a request body can not be smuggled in under an allowed key,
 *    and secret-shaped strings are replaced with a placeholder.
 *
 * Returns the cleaned object and the NAMES (never values) of dropped keys so
 * the caller can log a programming error without logging the payload.
 */
export function sanitizeMetadata(input: Record<string, unknown>): {
  metadata: SanitizedMetadata;
  droppedKeys: string[];
} {
  const allowed = new Set<string>(ALLOWED_METADATA_KEYS);
  const metadata: SanitizedMetadata = {};
  const droppedKeys: string[] = [];

  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue;
    if (!allowed.has(key)) {
      droppedKeys.push(key);
      continue;
    }
    if (Array.isArray(raw)) {
      const items = raw
        .map(cleanScalar)
        .filter((item): item is MetadataScalar => item !== undefined);
      metadata[key] = items.slice(0, 20);
      continue;
    }
    const scalar = cleanScalar(raw);
    if (scalar === undefined) {
      droppedKeys.push(key);
      continue;
    }
    metadata[key] = scalar;
  }

  return { metadata, droppedKeys };
}

/** The `ip_address` column is Postgres `inet`: an unparseable value would
 * fail the whole insert, so anything that is not an IP is dropped. */
export function sanitizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return isIP(ip) !== 0 ? ip : null;
}

export function sanitizeUserAgent(
  ua: string | undefined | null,
): string | null {
  if (!ua) return null;
  const cleaned = cleanText(ua, MAX_USER_AGENT_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

// local@label(.label)+ — a dotted domain, so a bare `Pass@word1` is not one.
const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@.]{1,63}(\.[^\s@.]{1,63})+$/;

/**
 * The identifier recorded for a failed login. Only an email-SHAPED string is
 * kept, lower-cased and capped at 254 chars; anything else yields null.
 *
 * Why record it at all: it is the field brute-force / credential-stuffing
 * investigation turns on ("which accounts were targeted, from where").
 * Why the shape check: a user who pastes their PASSWORD into the email box
 * must not have it stored, and an attacker must not get an arbitrary string
 * persisted. (LoginDto already rejects non-emails with 400 before login
 * runs; this is the second, independent gate.)
 */
export function sanitizeLoginIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = cleanText(value, 254).toLowerCase();
  if (!EMAIL_SHAPE.test(cleaned) || looksSecret(cleaned)) return null;
  return cleaned;
}
