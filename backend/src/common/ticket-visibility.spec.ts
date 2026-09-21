import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ticketVisibilitySql, ticketVisibilityWhere } from './ticket-visibility';

/**
 * ONE shared expectation per role, checked against BOTH dialects of the
 * visibility rule (the Prisma `where` used by the ORM paths and the raw-SQL
 * predicate used by the analytics aggregates). Each dialect is reduced to the
 * same facts, so a change to either one that is not mirrored in the other — or
 * in this table — fails a test, which asserting them in isolation would not.
 */
interface Facts {
  hidesSoftDeleted: boolean;
  /** The requester the rows are restricted to, or null when unrestricted. */
  restrictedToRequester: string | null;
}

const USER_ID = '99999999-9999-4999-8999-999999999999';

const EXPECTED: Record<Role, Facts> = {
  [Role.Employee]: { hidesSoftDeleted: true, restrictedToRequester: USER_ID },
  [Role.SupportAgent]: { hidesSoftDeleted: true, restrictedToRequester: null },
  [Role.TeamLead]: { hidesSoftDeleted: true, restrictedToRequester: null },
  [Role.Administrator]: { hidesSoftDeleted: true, restrictedToRequester: null },
};

function user(role: Role): AuthenticatedUser {
  return { id: USER_ID, email: 'u@opsnow.local', role };
}

function factsFromPrisma(role: Role): Facts {
  const where = ticketVisibilityWhere(user(role)) as {
    deletedAt?: unknown;
    requesterId?: unknown;
  };
  return {
    hidesSoftDeleted: where.deletedAt === null,
    restrictedToRequester:
      typeof where.requesterId === 'string' ? where.requesterId : null,
  };
}

function factsFromSql(role: Role): Facts {
  const fragment = ticketVisibilitySql(user(role));
  const requesterClause = /t\.requester_id\s*=\s*\?/.test(fragment.sql);
  return {
    hidesSoftDeleted: /t\.deleted_at IS NULL/.test(fragment.sql),
    // The id must be a BOUND parameter, never spliced into the text.
    restrictedToRequester: requesterClause ? String(fragment.values[0]) : null,
  };
}

describe('ticket visibility: Prisma and SQL dialects agree', () => {
  it('covers every role, so a new role cannot be forgotten', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.values(Role).sort());
  });

  it.each(Object.values(Role))('%s: the Prisma where matches the shared expectation', (role) => {
    expect(factsFromPrisma(role)).toEqual(EXPECTED[role]);
  });

  it.each(Object.values(Role))('%s: the SQL predicate matches the shared expectation', (role) => {
    expect(factsFromSql(role)).toEqual(EXPECTED[role]);
  });

  it.each(Object.values(Role))('%s: the two dialects agree with each other', (role) => {
    expect(factsFromSql(role)).toEqual(factsFromPrisma(role));
  });

  it('never splices the user id into the SQL text', () => {
    expect(ticketVisibilitySql(user(Role.Employee)).sql).not.toContain(USER_ID);
  });
});
