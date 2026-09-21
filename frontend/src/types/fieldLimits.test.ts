import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIELD_LIMITS } from './api';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = join(HERE, '../../../backend/src');

/**
 * `FIELD_LIMITS` is what every form uses for its `maxLength`, so it is the
 * reason a user is stopped before composing a request the server would
 * reject. If the backend ever tightens a cap and this mirror is not updated,
 * the form keeps accepting text the API will refuse — and the user gets an
 * opaque 400 on submit after typing, instead of being stopped while typing.
 * Loosening on either side is just as bad in reverse.
 *
 * The frontend is a separate package and cannot import the backend's DTOs,
 * so this test parses them (read-only), the same technique
 * `features/audit/auditActions.test.ts` uses for the audit action list.
 *
 * Each entry names the DTO file and the property whose `@MaxLength(n)`
 * decorator is authoritative.
 */
const MIRRORED: ReadonlyArray<{
  limit: keyof typeof FIELD_LIMITS;
  file: string;
  property: string;
}> = [
  { limit: 'subject', file: 'tickets/dto/create-ticket.dto.ts', property: 'subject' },
  {
    limit: 'description',
    file: 'tickets/dto/create-ticket.dto.ts',
    property: 'description',
  },
  {
    limit: 'commentBody',
    file: 'tickets/dto/create-ticket-comment.dto.ts',
    property: 'body',
  },
  { limit: 'assetTag', file: 'assets/dto/create-asset.dto.ts', property: 'assetTag' },
  { limit: 'assetName', file: 'assets/dto/create-asset.dto.ts', property: 'name' },
  {
    limit: 'serialNumber',
    file: 'assets/dto/create-asset.dto.ts',
    property: 'serialNumber',
  },
  { limit: 'assetNotes', file: 'assets/dto/create-asset.dto.ts', property: 'notes' },
  {
    limit: 'articleTitle',
    file: 'knowledge-base/dto/create-knowledge-article.dto.ts',
    property: 'title',
  },
  {
    limit: 'articleContent',
    file: 'knowledge-base/dto/create-knowledge-article.dto.ts',
    property: 'content',
  },
  {
    limit: 'articleFeedbackComment',
    file: 'knowledge-base/dto/create-article-feedback.dto.ts',
    property: 'comment',
  },
];

/**
 * Reads the `@MaxLength(n)` that applies to `property` — the nearest one
 * above the property's declaration, since decorators sit directly above the
 * field they annotate.
 */
function backendMaxLength(file: string, property: string): number {
  const path = join(BACKEND_SRC, file);
  const source = readFileSync(path, 'utf8');

  const declaration = new RegExp(`^\\s{2}${property}[?!]?:`, 'm').exec(source);
  if (!declaration) {
    throw new Error(`${file}: no declaration found for "${property}"`);
  }

  const before = source.slice(0, declaration.index);
  const matches = [...before.matchAll(/@MaxLength\((\d+)\)/g)];
  const nearest = matches.at(-1);
  if (!nearest) {
    throw new Error(`${file}: no @MaxLength above "${property}"`);
  }
  return Number(nearest[1]);
}

describe('FIELD_LIMITS mirrors the backend DTO caps', () => {
  it('can see the backend source', () => {
    expect(existsSync(BACKEND_SRC)).toBe(true);
  });

  it.each(MIRRORED)(
    'FIELD_LIMITS.$limit matches @MaxLength on $file $property',
    ({ limit, file, property }) => {
      expect(FIELD_LIMITS[limit]).toBe(backendMaxLength(file, property));
    },
  );

  it('mirrors every limit it declares, so a new one cannot be added unguarded', () => {
    expect(new Set(MIRRORED.map((entry) => entry.limit))).toEqual(
      new Set(Object.keys(FIELD_LIMITS)),
    );
  });
});
