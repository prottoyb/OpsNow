import { AuditOutcome } from './audit.constants';
import { buildAuditWhere } from './audit.filters';

describe('buildAuditWhere', () => {
  it('is an empty filter when nothing is supplied', () => {
    expect(buildAuditWhere({})).toEqual({});
  });

  it('ANDs each supplied filter as its own clause', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    expect(
      buildAuditWhere({
        actorId: 'a',
        action: 'ticket.created',
        entityType: 'Ticket' as never,
        entityId: 'e',
        outcome: AuditOutcome.Success,
        from,
        to,
      }),
    ).toEqual({
      AND: [
        { actorId: 'a' },
        { action: 'ticket.created' },
        { entityType: 'Ticket' },
        { entityId: 'e' },
        { metadata: { path: ['outcome'], equals: 'success' } },
        { createdAt: { gte: from, lte: to } },
      ],
    });
  });

  it('supports a one-sided date range', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(buildAuditWhere({ from })).toEqual({
      AND: [{ createdAt: { gte: from } }],
    });
    const to = new Date('2026-02-01T00:00:00Z');
    expect(buildAuditWhere({ to })).toEqual({
      AND: [{ createdAt: { lte: to } }],
    });
  });
});
