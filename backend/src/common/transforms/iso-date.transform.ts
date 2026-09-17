import { isISO8601 } from 'class-validator';

/**
 * class-transformer @Transform value function for date fields, used in
 * place of `@Type(() => Date)`.
 *
 * `@Type(() => Date)` coerces with `new Date(value)`, which accepts far
 * more than a date string: a JSON number is silently read as epoch
 * milliseconds (`12345` becomes 1970-01-01), and a year outside the
 * Postgres range (e.g. "275760-09-13") builds a perfectly valid JS Date
 * that only blows up later, in the driver, as a 500.
 *
 * This transform converts ONLY a well-formed ISO-8601 string. Anything
 * else — a number, a boolean, an object, a non-ISO or unparseable string
 * — is passed through unchanged so the field's `@IsDate()` rejects it as
 * a 400. Range is then bounded by `@MinDate`/`@MaxDate` on the field
 * itself, which is what keeps an in-format but absurd year (e.g.
 * "9999-12-31") from reaching the database.
 */
export function toIsoDate({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string' || !isISO8601(value, { strict: true })) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

/** Earliest date the API accepts. Comfortably inside the Postgres
 * timestamp range, while still rejecting the epoch-millisecond confusion
 * that an unquoted JSON number used to produce. */
export const MIN_ACCEPTED_DATE = new Date('1970-01-01T00:00:00.000Z');

/** Latest date the API accepts — a purchase or warranty date two
 * centuries out is already a typo rather than real data. */
export const MAX_ACCEPTED_DATE = new Date('2200-01-01T00:00:00.000Z');
