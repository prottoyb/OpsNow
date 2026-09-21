import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_OUTCOMES,
  isAuditReadRole,
} from '../../types/api';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_CONSTANTS = join(
  HERE,
  '../../../../backend/src/audit/audit.constants.ts',
);

/**
 * The frontend is a separate package and cannot import the backend's
 * constants, so `types/api.ts` carries a mirror. This test is what stops the
 * mirror drifting: it parses the backend source (read-only) and compares.
 */
describe('audit constants mirror the backend', () => {
  it('finds the backend constants file', () => {
    expect(existsSync(BACKEND_CONSTANTS)).toBe(true);
  });

  const source = existsSync(BACKEND_CONSTANTS)
    ? readFileSync(BACKEND_CONSTANTS, 'utf8')
    : '';

  /** The text from a declaration to its closing brace at column 0. */
  function block(startPattern: RegExp): string {
    const match = startPattern.exec(source);
    if (!match) throw new Error(`Backend constants: ${startPattern} not found`);
    const rest = source.slice(match.index);
    return rest.slice(0, rest.search(/\n\}/));
  }

  it('has the same closed action list, in the same order', () => {
    const actions = [
      ...block(/export const AuditAction = \{/).matchAll(/:\s*'([^']+)'/g),
    ].map((m) => m[1]);
    expect(actions.length).toBeGreaterThan(0);
    expect([...AUDIT_ACTIONS]).toEqual(actions);
  });

  it('has the same outcomes and entity types', () => {
    const values = (start: RegExp) =>
      [...block(start).matchAll(/=\s*'([^']+)'/g)].map((m) => m[1]);
    expect([...AUDIT_OUTCOMES]).toEqual(values(/export enum AuditOutcome \{/));
    expect([...AUDIT_ENTITY_TYPES]).toEqual(
      values(/export enum AuditEntityType \{/),
    );
  });

  it('is Administrator-only', () => {
    expect(source).toMatch(/AUDIT_READ_ROLES: Role\[\] = \[Role\.Administrator\]/);
    expect(isAuditReadRole('Administrator')).toBe(true);
    for (const role of ['Employee', 'SupportAgent', 'TeamLead'] as const) {
      expect(isAuditReadRole(role)).toBe(false);
    }
  });
});
