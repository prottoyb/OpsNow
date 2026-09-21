import { Role, TicketPriority } from '@prisma/client';
import { AuditAction, AuditEntityType, AuditOutcome } from './audit.constants';
import {
  accessDenied,
  assetAssignmentChanged,
  loggedOut,
  loginFailed,
  loginSucceeded,
  refreshFailed,
  registered,
  ticketAssignmentChanged,
  ticketCreated,
  ticketPriorityChanged,
  ticketStatusChanged,
  ticketUpdated,
  tokenRefreshed,
} from './audit.events';
import { ALLOWED_METADATA_KEYS } from './audit.constants';

const REQ = { ipAddress: '203.0.113.9', userAgent: 'jest' };

describe('audit event builders', () => {
  it('loginSucceeded names the actor and the account, with request context', () => {
    expect(loginSucceeded('u1', REQ)).toEqual({
      action: AuditAction.AuthLoginSucceeded,
      outcome: AuditOutcome.Success,
      actorId: 'u1',
      entityType: AuditEntityType.User,
      entityId: 'u1',
      metadata: {},
      request: REQ,
    });
  });

  describe('loginFailed', () => {
    it('has no actor, records reason and the normalised identifier', () => {
      const e = loginFailed('Jane@OpsNow.local', 'bad_password', 'u1', REQ);
      expect(e.actorId).toBeNull();
      expect(e.outcome).toBe(AuditOutcome.Failure);
      expect(e.entityId).toBe('u1');
      expect(e.metadata).toEqual({
        reason: 'bad_password',
        identifier: 'jane@opsnow.local',
      });
    });

    it('for an unknown account has no entity, and never carries a password', () => {
      const e = loginFailed('ghost@x.com', 'unknown_account', null, REQ);
      expect(e.entityType).toBeNull();
      expect(e.entityId).toBeNull();
      // The builder's signature has no password parameter; also assert the
      // output has no such key and nothing password-shaped.
      expect(Object.keys(e.metadata).sort()).toEqual(['identifier', 'reason']);
      expect(JSON.stringify(e)).not.toMatch(/password/i);
    });

    it('stores a null identifier when the input is not email-shaped', () => {
      const e = loginFailed('Sentinel-P@ss w0rd', 'unknown_account', null, REQ);
      expect(e.metadata.identifier).toBeNull();
      expect(JSON.stringify(e)).not.toContain('Sentinel');
    });
  });

  it('logout, refresh and registration events are attributed to the account', () => {
    expect(loggedOut('u1', REQ).action).toBe(AuditAction.AuthLogout);
    expect(tokenRefreshed('u1', REQ).action).toBe(AuditAction.AuthTokenRefreshed);
    expect(registered('u1', REQ).action).toBe(AuditAction.AuthRegistered);
    const failed = refreshFailed('u1', 'reuse_detected', REQ);
    expect(failed.actorId).toBeNull();
    expect(failed.entityId).toBe('u1');
    expect(failed.metadata).toEqual({ reason: 'reuse_detected' });
  });

  it('ticketCreated records identifiers and non-sensitive scalars, not free text', () => {
    const e = ticketCreated('u1', {
      id: 't1',
      ticketNumber: 42,
      priority: TicketPriority.High,
      categoryId: 'c1',
    });
    expect(e.metadata).toEqual({
      ticketNumber: '42',
      priority: 'High',
      categoryId: 'c1',
    });
  });

  it('ticketUpdated records which fields changed and the category ids', () => {
    const e = ticketUpdated('u1', 't1', ['subject', 'categoryId'], {
      from: 'c1',
      to: 'c2',
    });
    expect(e.metadata).toEqual({
      changedFields: ['subject', 'categoryId'],
      categoryIdFrom: 'c1',
      categoryIdTo: 'c2',
    });
    expect(ticketUpdated('u1', 't1', ['subject']).metadata).toEqual({
      changedFields: ['subject'],
    });
  });

  it('status and priority changes carry from/to', () => {
    expect(ticketStatusChanged('u1', 't1', 'New', 'Open').metadata).toEqual({
      from: 'New',
      to: 'Open',
    });
    expect(
      ticketPriorityChanged('u1', 't1', TicketPriority.Low, TicketPriority.High)
        .metadata,
    ).toEqual({ from: 'Low', to: 'High' });
  });

  it('assignment vs unassignment picks the action from the target', () => {
    expect(ticketAssignmentChanged('u1', 't1', null, 'a1').action).toBe(
      AuditAction.TicketAssigned,
    );
    const un = ticketAssignmentChanged('u1', 't1', 'a1', null);
    expect(un.action).toBe(AuditAction.TicketUnassigned);
    expect(un.metadata).toEqual({ from: 'a1', to: null });
    expect(assetAssignmentChanged('u1', 'as1', null, 'a1').action).toBe(
      AuditAction.AssetAssigned,
    );
    expect(assetAssignmentChanged('u1', 'as1', 'a1', null).action).toBe(
      AuditAction.AssetReturned,
    );
  });

  it('accessDenied records role, requirement and route pattern with outcome denied', () => {
    const e = accessDenied(
      'u1',
      Role.Employee,
      [Role.Administrator],
      'GET',
      '/api/v1/audit-logs',
      REQ,
    );
    expect(e.outcome).toBe(AuditOutcome.Denied);
    expect(e.metadata).toEqual({
      actorRole: 'Employee',
      requiredRoles: ['Administrator'],
      method: 'GET',
      route: '/api/v1/audit-logs',
    });
  });

  it('every metadata key any builder emits is on the allow-list', () => {
    const events = [
      loginFailed('a@b.co', 'bad_password', 'u', REQ),
      refreshFailed('u', 'expired', REQ),
      ticketCreated('u', {
        id: 't',
        ticketNumber: 1,
        priority: TicketPriority.Low,
        categoryId: null,
      }),
      ticketUpdated('u', 't', ['x'], { from: null, to: 'c' }),
      ticketStatusChanged('u', 't', 'a', 'b'),
      ticketAssignmentChanged('u', 't', null, 'a'),
      accessDenied('u', Role.Employee, [Role.Administrator], 'GET', '/r', REQ),
    ];
    const allowed = new Set<string>(ALLOWED_METADATA_KEYS);
    for (const e of events) {
      for (const key of Object.keys(e.metadata)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});
