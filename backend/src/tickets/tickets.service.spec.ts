import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentVisibility, Role, TicketPriority, TicketStatus } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlaService } from '../sla/sla.service';
import { TicketCategoriesService } from '../ticket-categories/ticket-categories.service';
import { UsersService } from '../users/users.service';
import { TicketsService } from './tickets.service';

function buildUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'employee-1',
    email: 'employee@opsnow.local',
    passwordHash: 'hash',
    firstName: 'Jane',
    lastName: 'Doe',
    role: Role.Employee,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    ticketNumber: 1,
    subject: 'Laptop broken',
    description: 'It will not turn on.',
    requesterId: 'employee-1',
    assigneeId: null,
    categoryId: null,
    priority: TicketPriority.Medium,
    status: TicketStatus.New,
    reopenedCount: 0,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    requester: buildUserRecord(),
    assignee: null,
    category: null,
    sla: null,
    ...overrides,
  };
}

function authUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'employee-1',
    email: 'employee@opsnow.local',
    role: Role.Employee,
    ...overrides,
  };
}

const staffUser = authUser({ id: 'agent-1', email: 'agent@opsnow.local', role: Role.SupportAgent });

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: {
    ticket: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    ticketHistory: {
      create: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    ticketComment: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let usersService: { findById: jest.Mock };
  let ticketCategoriesService: { findActiveById: jest.Mock };
  let slaService: {
    attachOnCreate: jest.Mock;
    recordFirstResponse: jest.Mock;
    pauseForHold: jest.Mock;
    resumeFromPause: jest.Mock;
    handlePriorityChange: jest.Mock;
    recordResolutionOutcome: jest.Mock;
    toTicketSlaResponse: jest.Mock;
  };
  let assetsService: {
    findForTicket: jest.Mock;
    linkToTicket: jest.Mock;
    unlinkFromTicket: jest.Mock;
  };
  let knowledgeBaseService: {
    findForTicket: jest.Mock;
    linkToTicket: jest.Mock;
    unlinkFromTicket: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      ticket: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      ticketHistory: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      ticketComment: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    usersService = { findById: jest.fn() };
    ticketCategoriesService = { findActiveById: jest.fn() };
    slaService = {
      attachOnCreate: jest.fn(),
      recordFirstResponse: jest.fn(),
      pauseForHold: jest.fn(),
      resumeFromPause: jest.fn(),
      handlePriorityChange: jest.fn(),
      recordResolutionOutcome: jest.fn(),
      toTicketSlaResponse: jest.fn().mockReturnValue(null),
    };
    assetsService = {
      findForTicket: jest.fn().mockResolvedValue([]),
      linkToTicket: jest.fn(),
      unlinkFromTicket: jest.fn(),
    };
    knowledgeBaseService = {
      findForTicket: jest.fn().mockResolvedValue([]),
      linkToTicket: jest.fn(),
      unlinkFromTicket: jest.fn(),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };

    service = new TicketsService(
      prisma as unknown as PrismaService,
      usersService as unknown as UsersService,
      ticketCategoriesService as unknown as TicketCategoriesService,
      slaService as unknown as SlaService,
      assetsService as unknown as AssetsService,
      knowledgeBaseService as unknown as KnowledgeBaseService,
      audit as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('rejects an inactive/unknown categoryId', async () => {
      ticketCategoriesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.create(
          { subject: 'x', description: 'y', categoryId: 'bad-cat' },
          authUser(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('creates with requesterId from the caller and defaults priority to Medium', async () => {
      const created = buildTicket();
      prisma.ticket.create.mockResolvedValue(created);
      prisma.ticketHistory.create.mockResolvedValue({});
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());

      await service.create({ subject: 'Laptop broken', description: 'It will not turn on.' }, authUser());

      expect(prisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requesterId: 'employee-1',
          priority: TicketPriority.Medium,
        }),
      });
      expect(prisma.ticketHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fieldName: 'status',
          oldValue: null,
          newValue: TicketStatus.New,
        }),
      });
    });

    it('attaches an SLA snapshot for the new ticket, inside the same transaction, after the ticket row is created', async () => {
      const created = buildTicket({ priority: TicketPriority.High });
      prisma.ticket.create.mockResolvedValue(created);
      prisma.ticketHistory.create.mockResolvedValue({});
      prisma.ticket.findFirst.mockResolvedValue(created);

      await service.create(
        { subject: 'x', description: 'y', priority: TicketPriority.High },
        authUser(),
      );

      expect(slaService.attachOnCreate).toHaveBeenCalledWith(
        prisma,
        created.id,
        TicketPriority.High,
        created.createdAt,
      );
    });
  });

  describe('findAll', () => {
    // The `where` clause is `{ AND: [...] }` (visibility ANDed as its own
    // top-level clause — see the fix comment in tickets.service.ts), so
    // flatten it before asserting on its effective content.
    function flattenWhere(mockCall: unknown): Record<string, unknown> {
      const where = (mockCall as { where: { AND: Record<string, unknown>[] } })
        .where;
      return Object.assign({}, ...where.AND);
    }

    it('scopes to the caller for an Employee', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.findAll({ limit: 20, offset: 0 } as never, authUser());

      const where = flattenWhere(prisma.ticket.findMany.mock.calls[0][0]);
      expect(where).toMatchObject({ deletedAt: null, requesterId: 'employee-1' });
    });

    it('does not scope to the caller for staff', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.findAll({ limit: 20, offset: 0 } as never, staffUser);

      const where = flattenWhere(prisma.ticket.findMany.mock.calls[0][0]);
      expect(where).not.toHaveProperty('requesterId');
      expect(where.deletedAt).toBeNull();
    });

    it('applies status/priority/categoryId/assigneeId filters when present', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.findAll(
        {
          limit: 20,
          offset: 0,
          status: TicketStatus.Open,
          priority: TicketPriority.High,
          categoryId: 'cat-1',
          assigneeId: 'agent-1',
        } as never,
        staffUser,
      );

      const where = flattenWhere(prisma.ticket.findMany.mock.calls[0][0]);
      expect(where).toMatchObject({
        status: TicketStatus.Open,
        priority: TicketPriority.High,
        categoryId: 'cat-1',
        assigneeId: 'agent-1',
      });
    });

    it('scopes findAll.count with the identical where clause used for findMany (so total is never unfiltered)', async () => {
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(0);

      await service.findAll({ limit: 20, offset: 0 } as never, authUser());

      expect(prisma.ticket.count).toHaveBeenCalledWith({
        where: prisma.ticket.findMany.mock.calls[0][0].where,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFound when the ticket is not visible (wrong owner or soft-deleted)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(service.findOne('ticket-1', authUser())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('excludes soft-deleted tickets by querying with deletedAt: null (the exact clause the architect review rated CRITICAL)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('ticket-1', authUser()),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('scopes an Employee to their own ticket in the same findFirst call', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('ticket-1', authUser()),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'ticket-1',
            deletedAt: null,
            requesterId: 'employee-1',
          }),
        }),
      );
    });

    it('does not scope staff to a particular requester', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());

      await service.findOne('ticket-1', staffUser);

      const where = prisma.ticket.findFirst.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('requesterId');
      expect(where.deletedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('rejects an Employee editing their own ticket once it has left New', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ status: TicketStatus.InProgress }),
      );

      await expect(
        service.update('ticket-1', { subject: 'new subject' }, authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
    });

    it('allows staff to edit regardless of status', async () => {
      const before = buildTicket({ status: TicketStatus.InProgress });
      prisma.ticket.findFirst.mockResolvedValueOnce(before).mockResolvedValueOnce({
        ...before,
        subject: 'new subject',
      });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.createMany.mockResolvedValue({});

      await service.update('ticket-1', { subject: 'new subject' }, staffUser);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'ticket-1',
          updatedAt: before.updatedAt,
        }),
        data: expect.objectContaining({ subject: 'new subject' }),
      });
      expect(prisma.ticketHistory.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            fieldName: 'subject',
            oldValue: 'Laptop broken',
            newValue: 'new subject',
          }),
        ],
      });
    });

    it('writes history only for fields that actually changed', async () => {
      const before = buildTicket({ subject: 'Laptop broken' });
      prisma.ticket.findFirst.mockResolvedValueOnce(before).mockResolvedValueOnce(before);
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.createMany.mockResolvedValue({});

      await service.update(
        'ticket-1',
        { subject: 'Laptop broken', description: 'A new description' },
        staffUser,
      );

      const historyData = prisma.ticketHistory.createMany.mock.calls[0][0].data;
      expect(historyData).toHaveLength(1);
      expect(historyData[0].fieldName).toBe('description');
    });

    it('is a no-op (no transaction) when nothing actually changed', async () => {
      const ticket = buildTicket({ subject: 'Laptop broken' });
      prisma.ticket.findFirst.mockResolvedValue(ticket);

      await service.update('ticket-1', { subject: 'Laptop broken' }, staffUser);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid categoryId', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      ticketCategoriesService.findActiveById.mockResolvedValue(null);

      await expect(
        service.update('ticket-1', { categoryId: 'bad-cat' }, staffUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 409 when it loses the edit race (CAS miss on updatedAt)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('ticket-1', { subject: 'raced edit' }, staffUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.ticketHistory.createMany).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('rejects a non-staff caller (defense-in-depth beyond the controller guard)', async () => {
      await expect(
        service.assign('ticket-1', { assigneeId: null }, authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    });

    it('rejects assigning to an inactive or non-staff user', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      usersService.findById.mockResolvedValue(
        buildUserRecord({ id: 'employee-2', role: Role.Employee }),
      );

      await expect(
        service.assign('ticket-1', { assigneeId: 'employee-2' }, staffUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is a no-op when assigning to the current assignee', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ assigneeId: 'agent-1' }),
      );

      await service.assign('ticket-1', { assigneeId: 'agent-1' }, staffUser);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns 409 when it loses the assignment race (CAS miss)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket({ assigneeId: null }));
      usersService.findById.mockResolvedValue(
        buildUserRecord({ id: 'agent-2', role: Role.SupportAgent, isActive: true }),
      );
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.assign('ticket-1', { assigneeId: 'agent-2' }, staffUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.ticketHistory.create).not.toHaveBeenCalled();
    });

    it('assigns successfully and records the old/new assignee in history', async () => {
      const before = buildTicket({ assigneeId: null });
      const newAssignee = buildUserRecord({
        id: 'agent-2',
        role: Role.SupportAgent,
        isActive: true,
      });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({
          ...before,
          assigneeId: 'agent-2',
          assignee: newAssignee,
        });
      usersService.findById.mockResolvedValue(newAssignee);
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.create.mockResolvedValue({});

      const result = await service.assign('ticket-1', { assigneeId: 'agent-2' }, staffUser);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', assigneeId: null, deletedAt: null },
        data: { assigneeId: 'agent-2' },
      });
      expect(prisma.ticketHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fieldName: 'assigneeId',
          oldValue: null,
          newValue: 'agent-2',
        }),
      });
      expect(result.assignee?.id).toBe('agent-2');
    });

    it('allows unassigning by passing assigneeId: null', async () => {
      const before = buildTicket({ assigneeId: 'agent-1' });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, assigneeId: null });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.create.mockResolvedValue({});

      await service.assign('ticket-1', { assigneeId: null }, staffUser);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', assigneeId: 'agent-1', deletedAt: null },
        data: { assigneeId: null },
      });
    });
  });

  describe('updateStatus (transition matrix)', () => {
    it.each([
      [TicketStatus.New, TicketStatus.Open],
      [TicketStatus.Open, TicketStatus.InProgress],
      [TicketStatus.InProgress, TicketStatus.OnHold],
      [TicketStatus.OnHold, TicketStatus.Resolved],
      [TicketStatus.Resolved, TicketStatus.Closed],
    ])('staff may transition %s -> %s', async (from, to) => {
      const before = buildTicket({ status: from });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, status: to });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.createMany.mockResolvedValue({});

      await service.updateStatus('ticket-1', { status: to }, staffUser);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-1', status: from, deletedAt: null },
        }),
      );
    });

    it('rejects every attempted transition out of Closed, even for staff', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ status: TicketStatus.Closed }),
      );

      await expect(
        service.updateStatus('ticket-1', { status: TicketStatus.Open }, staffUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a same-status no-op transition with 400', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ status: TicketStatus.Open }),
      );

      await expect(
        service.updateStatus('ticket-1', { status: TicketStatus.Open }, staffUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets resolvedAt when transitioning to Resolved if not already set', async () => {
      const before = buildTicket({ status: TicketStatus.InProgress, resolvedAt: null });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, status: TicketStatus.Resolved, resolvedAt: new Date() });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.createMany.mockResolvedValue({});

      await service.updateStatus('ticket-1', { status: TicketStatus.Resolved }, staffUser);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
        }),
      );
    });

    it('sets both resolvedAt and closedAt when closing directly from an unresolved status', async () => {
      const before = buildTicket({ status: TicketStatus.New, resolvedAt: null, closedAt: null });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, status: TicketStatus.Closed });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.createMany.mockResolvedValue({});

      await service.updateStatus('ticket-1', { status: TicketStatus.Closed }, staffUser);

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            closedAt: expect.any(Date),
            resolvedAt: expect.any(Date),
          }),
        }),
      );
    });

    describe('SLA hook wiring (ADR-020)', () => {
      it('pauses the SLA clock when entering OnHold, after the CAS succeeds', async () => {
        const before = buildTicket({ status: TicketStatus.InProgress });
        prisma.ticket.findFirst
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce({ ...before, status: TicketStatus.OnHold });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticketHistory.createMany.mockResolvedValue({});

        await service.updateStatus(
          'ticket-1',
          { status: TicketStatus.OnHold },
          staffUser,
        );

        expect(slaService.pauseForHold).toHaveBeenCalledWith(prisma, 'ticket-1');
        expect(slaService.resumeFromPause).not.toHaveBeenCalled();
        expect(slaService.recordResolutionOutcome).not.toHaveBeenCalled();
        expect(prisma.ticket.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
          slaService.pauseForHold.mock.invocationCallOrder[0],
        );
      });

      it('resumes the SLA clock when leaving OnHold to a non-terminal status', async () => {
        const before = buildTicket({ status: TicketStatus.OnHold });
        prisma.ticket.findFirst
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce({ ...before, status: TicketStatus.InProgress });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticketHistory.createMany.mockResolvedValue({});

        await service.updateStatus(
          'ticket-1',
          { status: TicketStatus.InProgress },
          staffUser,
        );

        expect(slaService.resumeFromPause).toHaveBeenCalledWith(prisma, 'ticket-1');
        expect(slaService.pauseForHold).not.toHaveBeenCalled();
        expect(slaService.recordResolutionOutcome).not.toHaveBeenCalled();
      });

      it('resumes the SLA clock BEFORE recording the resolution outcome when resolving straight out of OnHold', async () => {
        const before = buildTicket({ status: TicketStatus.OnHold, resolvedAt: null });
        prisma.ticket.findFirst
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce({ ...before, status: TicketStatus.Resolved, resolvedAt: new Date() });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticketHistory.createMany.mockResolvedValue({});

        await service.updateStatus(
          'ticket-1',
          { status: TicketStatus.Resolved },
          staffUser,
        );

        expect(slaService.resumeFromPause).toHaveBeenCalledWith(prisma, 'ticket-1');
        expect(slaService.recordResolutionOutcome).toHaveBeenCalledWith(prisma, 'ticket-1');
        // Ordering is load-bearing (ADR-020): resolving out of a still-paused
        // clock must shift the due date via resume BEFORE the breach check
        // in recordResolutionOutcome runs, or an on-time resolution could be
        // misreported as a breach.
        expect(
          slaService.resumeFromPause.mock.invocationCallOrder[0],
        ).toBeLessThan(slaService.recordResolutionOutcome.mock.invocationCallOrder[0]);
      });

      it('records the resolution outcome when resolving from a running (non-OnHold) status, without touching pause hooks', async () => {
        const before = buildTicket({ status: TicketStatus.InProgress, resolvedAt: null });
        prisma.ticket.findFirst
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce({ ...before, status: TicketStatus.Resolved, resolvedAt: new Date() });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticketHistory.createMany.mockResolvedValue({});

        await service.updateStatus(
          'ticket-1',
          { status: TicketStatus.Resolved },
          staffUser,
        );

        expect(slaService.recordResolutionOutcome).toHaveBeenCalledWith(prisma, 'ticket-1');
        expect(slaService.pauseForHold).not.toHaveBeenCalled();
        expect(slaService.resumeFromPause).not.toHaveBeenCalled();
      });

      it('records the resolution outcome when closing directly from an unresolved status', async () => {
        const before = buildTicket({ status: TicketStatus.New, resolvedAt: null, closedAt: null });
        prisma.ticket.findFirst
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce({ ...before, status: TicketStatus.Closed });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticketHistory.createMany.mockResolvedValue({});

        await service.updateStatus(
          'ticket-1',
          { status: TicketStatus.Closed },
          staffUser,
        );

        expect(slaService.recordResolutionOutcome).toHaveBeenCalledWith(prisma, 'ticket-1');
      });

      it('does not call any SLA hook for a plain transition that neither touches OnHold nor resolves the ticket', async () => {
        const before = buildTicket({ status: TicketStatus.New });
        prisma.ticket.findFirst
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce({ ...before, status: TicketStatus.Open });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticketHistory.createMany.mockResolvedValue({});

        await service.updateStatus('ticket-1', { status: TicketStatus.Open }, staffUser);

        expect(slaService.pauseForHold).not.toHaveBeenCalled();
        expect(slaService.resumeFromPause).not.toHaveBeenCalled();
        expect(slaService.recordResolutionOutcome).not.toHaveBeenCalled();
      });

      it('does not call any SLA hook when the status CAS is lost', async () => {
        prisma.ticket.findFirst.mockResolvedValue(
          buildTicket({ status: TicketStatus.OnHold }),
        );
        prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.updateStatus('ticket-1', { status: TicketStatus.Resolved }, staffUser),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(slaService.resumeFromPause).not.toHaveBeenCalled();
        expect(slaService.recordResolutionOutcome).not.toHaveBeenCalled();
      });
    });

    it('rejects a 409 when it loses the status-transition race (CAS miss)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ status: TicketStatus.Open }),
      );
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus('ticket-1', { status: TicketStatus.InProgress }, staffUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.ticketHistory.createMany).not.toHaveBeenCalled();
    });

    describe('Employee reopen (the only transition an Employee may perform)', () => {
      it('allows Resolved -> Open on their own ticket, clearing timestamps and incrementing reopenedCount', async () => {
        const before = buildTicket({
          status: TicketStatus.Resolved,
          resolvedAt: new Date('2026-01-01'),
          closedAt: null,
          reopenedCount: 0,
        });
        prisma.ticket.findFirst
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce({
            ...before,
            status: TicketStatus.Open,
            resolvedAt: null,
            reopenedCount: 1,
          });
        prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
        prisma.ticketHistory.createMany.mockResolvedValue({});

        const result = await service.updateStatus(
          'ticket-1',
          { status: TicketStatus.Open },
          authUser(),
        );

        expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: TicketStatus.Open,
              resolvedAt: null,
              closedAt: null,
              reopenedCount: { increment: 1 },
            }),
          }),
        );
        const historyData = prisma.ticketHistory.createMany.mock.calls[0][0].data;
        expect(historyData).toHaveLength(2);
        expect(historyData[0].fieldName).toBe('status');
        expect(historyData[1]).toMatchObject({
          fieldName: 'reopened_count',
          oldValue: '0',
          newValue: '1',
        });
        expect(result.reopenedCount).toBe(1);
        // D4 pause-credit mechanism: reopen reuses the identical resume
        // statement, crediting the resolved-to-reopened interval as paused
        // time (ADR-020).
        expect(slaService.resumeFromPause).toHaveBeenCalledWith(prisma, 'ticket-1');
      });

      it('rejects any other transition attempted by the ticket requester', async () => {
        prisma.ticket.findFirst.mockResolvedValue(
          buildTicket({ status: TicketStatus.Open }),
        );

        await expect(
          service.updateStatus(
            'ticket-1',
            { status: TicketStatus.InProgress },
            authUser(),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('rejects reopening a Closed ticket even for its own requester', async () => {
        prisma.ticket.findFirst.mockResolvedValue(
          buildTicket({ status: TicketStatus.Closed }),
        );

        await expect(
          service.updateStatus('ticket-1', { status: TicketStatus.Open }, authUser()),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });
  });

  describe('updatePriority', () => {
    it('rejects a non-staff caller', async () => {
      await expect(
        service.updatePriority('ticket-1', { priority: TicketPriority.High }, authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('is a no-op when the priority is unchanged', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ priority: TicketPriority.High }),
      );

      await service.updatePriority(
        'ticket-1',
        { priority: TicketPriority.High },
        staffUser,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates priority, applies the SLA target delta, and writes a history row', async () => {
      const before = buildTicket({ priority: TicketPriority.Medium });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, priority: TicketPriority.Critical });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.create.mockResolvedValue({});

      await service.updatePriority(
        'ticket-1',
        { priority: TicketPriority.Critical },
        staffUser,
      );

      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ticket-1',
          priority: TicketPriority.Medium,
          deletedAt: null,
        },
        data: { priority: TicketPriority.Critical },
      });
      expect(slaService.handlePriorityChange).toHaveBeenCalledWith(
        prisma,
        'ticket-1',
        TicketPriority.Critical,
        null,
      );
      expect(prisma.ticketHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fieldName: 'priority',
          oldValue: TicketPriority.Medium,
          newValue: TicketPriority.Critical,
        }),
      });
    });

    it('passes the ticket\'s own resolvedAt through to the SLA hook (M7: skips the delta once already resolved)', async () => {
      const resolvedAt = new Date('2026-02-01T00:00:00Z');
      const before = buildTicket({ priority: TicketPriority.Medium, resolvedAt });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, priority: TicketPriority.Critical });
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.create.mockResolvedValue({});

      await service.updatePriority(
        'ticket-1',
        { priority: TicketPriority.Critical },
        staffUser,
      );

      expect(slaService.handlePriorityChange).toHaveBeenCalledWith(
        prisma,
        'ticket-1',
        TicketPriority.Critical,
        resolvedAt,
      );
    });

    it('returns 409 and never applies the SLA delta when it loses the priority-change race (CAS miss)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ priority: TicketPriority.Medium }),
      );
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updatePriority(
          'ticket-1',
          { priority: TicketPriority.Critical },
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(slaService.handlePriorityChange).not.toHaveBeenCalled();
      expect(prisma.ticketHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('createComment', () => {
    it('throws NotFound if the ticket is not visible', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);

      await expect(
        service.createComment('ticket-1', { body: 'hello' }, authUser()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an Employee creating an Internal note', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());

      await expect(
        service.createComment(
          'ticket-1',
          { body: 'hello', visibility: CommentVisibility.Internal },
          authUser(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticketComment.create).not.toHaveBeenCalled();
    });

    it('allows staff to create an Internal note, and never records it as a first response (D3)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      prisma.ticketComment.create.mockResolvedValue({
        id: 'comment-1',
        body: 'internal note',
        visibility: CommentVisibility.Internal,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: buildUserRecord({ id: 'agent-1', role: Role.SupportAgent }),
      });

      const result = await service.createComment(
        'ticket-1',
        { body: 'internal note', visibility: CommentVisibility.Internal },
        staffUser,
      );

      expect(result.visibility).toBe(CommentVisibility.Internal);
      expect(slaService.recordFirstResponse).not.toHaveBeenCalled();
    });

    it('defaults visibility to Public', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      prisma.ticketComment.create.mockResolvedValue({
        id: 'comment-1',
        body: 'hi',
        visibility: CommentVisibility.Public,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: buildUserRecord(),
      });

      await service.createComment('ticket-1', { body: 'hi' }, authUser());

      expect(prisma.ticketComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ visibility: CommentVisibility.Public }),
        }),
      );
    });

    it('records the first qualifying response for a staff Public reply on someone else\'s ticket (ADR-020 D3)', async () => {
      const respondedAt = new Date('2026-02-01T00:00:00Z');
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ requesterId: 'employee-1' }),
      );
      prisma.ticketComment.create.mockResolvedValue({
        id: 'comment-1',
        body: 'we are on it',
        visibility: CommentVisibility.Public,
        createdAt: respondedAt,
        updatedAt: respondedAt,
        author: buildUserRecord({ id: 'agent-1', role: Role.SupportAgent }),
      });

      await service.createComment(
        'ticket-1',
        { body: 'we are on it', visibility: CommentVisibility.Public },
        staffUser,
      );

      expect(slaService.recordFirstResponse).toHaveBeenCalledWith(
        prisma,
        'ticket-1',
        respondedAt,
      );
    });

    it('does not record a first response for an Employee\'s own Public comment', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      prisma.ticketComment.create.mockResolvedValue({
        id: 'comment-1',
        body: 'hi',
        visibility: CommentVisibility.Public,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: buildUserRecord(),
      });

      await service.createComment('ticket-1', { body: 'hi' }, authUser());

      expect(slaService.recordFirstResponse).not.toHaveBeenCalled();
    });

    it('does not record a first response when a staff member replies on their own filed ticket', async () => {
      const staffAsRequester = authUser({
        id: 'agent-1',
        email: 'agent@opsnow.local',
        role: Role.SupportAgent,
      });
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ requesterId: 'agent-1' }),
      );
      prisma.ticketComment.create.mockResolvedValue({
        id: 'comment-1',
        body: 'note to self',
        visibility: CommentVisibility.Public,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: buildUserRecord({ id: 'agent-1', role: Role.SupportAgent }),
      });

      await service.createComment(
        'ticket-1',
        { body: 'note to self', visibility: CommentVisibility.Public },
        staffAsRequester,
      );

      expect(slaService.recordFirstResponse).not.toHaveBeenCalled();
    });
  });

  describe('findComments', () => {
    it('filters to Public-only for an Employee, in both findMany and count', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      prisma.ticketComment.findMany.mockResolvedValue([]);
      prisma.ticketComment.count.mockResolvedValue(0);

      await service.findComments('ticket-1', { limit: 20, offset: 0 } as never, authUser());

      expect(prisma.ticketComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ visibility: CommentVisibility.Public }),
        }),
      );
      expect(prisma.ticketComment.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ visibility: CommentVisibility.Public }),
      });
    });

    it('does not filter by visibility for staff', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      prisma.ticketComment.findMany.mockResolvedValue([]);
      prisma.ticketComment.count.mockResolvedValue(0);

      await service.findComments('ticket-1', { limit: 20, offset: 0 } as never, staffUser);

      const where = prisma.ticketComment.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('visibility');
    });
  });

  describe('findHistory', () => {
    it('rejects a non-staff caller', async () => {
      await expect(
        service.findHistory('ticket-1', { limit: 20, offset: 0 } as never, authUser()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.ticket.findFirst).not.toHaveBeenCalled();
    });

    it('returns history entries for staff', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      prisma.ticketHistory.findMany.mockResolvedValue([
        {
          id: 'hist-1',
          fieldName: 'status',
          oldValue: null,
          newValue: 'New',
          createdAt: new Date(),
          actor: buildUserRecord(),
        },
      ]);
      prisma.ticketHistory.count.mockResolvedValue(1);

      const result = await service.findHistory(
        'ticket-1',
        { limit: 20, offset: 0 } as never,
        staffUser,
      );

      expect(result.total).toBe(1);
      expect(result.data[0].fieldName).toBe('status');
    });
  });

  describe('ticket <-> asset links', () => {
    const link = {
      ticketId: 'ticket-1',
      linkedAt: new Date(),
      linkedBy: null,
      asset: { id: 'asset-1' },
    };

    describe('findAssets', () => {
      it('scopes the ticket lookup to the caller before listing links', async () => {
        prisma.ticket.findFirst.mockResolvedValue(buildTicket());
        assetsService.findForTicket.mockResolvedValue([link]);

        const result = await service.findAssets('ticket-1', authUser());

        expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'ticket-1',
              deletedAt: null,
              requesterId: 'employee-1',
            }),
          }),
        );
        expect(result).toEqual([link]);
      });

      it('404s for a ticket outside the caller scope, without listing anything', async () => {
        prisma.ticket.findFirst.mockResolvedValue(null);

        await expect(
          service.findAssets('ticket-1', authUser({ id: 'employee-2' })),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(assetsService.findForTicket).not.toHaveBeenCalled();
      });
    });

    describe('linkAsset', () => {
      it('rejects a non-staff caller (defense-in-depth beyond the controller guard)', async () => {
        await expect(
          service.linkAsset('ticket-1', { assetId: 'asset-1' }, authUser()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(assetsService.linkToTicket).not.toHaveBeenCalled();
      });

      it('404s for a ticket outside the caller scope, without linking', async () => {
        prisma.ticket.findFirst.mockResolvedValue(null);

        await expect(
          service.linkAsset('ticket-1', { assetId: 'asset-1' }, staffUser),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(assetsService.linkToTicket).not.toHaveBeenCalled();
      });

      it('delegates to AssetsService once the ticket is visible', async () => {
        prisma.ticket.findFirst.mockResolvedValue(buildTicket());
        assetsService.linkToTicket.mockResolvedValue(link);

        const result = await service.linkAsset(
          'ticket-1',
          { assetId: 'asset-1' },
          staffUser,
        );

        expect(assetsService.linkToTicket).toHaveBeenCalledWith(
          'ticket-1',
          'asset-1',
          staffUser,
        );
        expect(result).toEqual(link);
      });
    });

    describe('unlinkAsset', () => {
      it('rejects a non-staff caller', async () => {
        await expect(
          service.unlinkAsset('ticket-1', 'asset-1', authUser()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(assetsService.unlinkFromTicket).not.toHaveBeenCalled();
      });

      it('404s for a ticket outside the caller scope, without unlinking', async () => {
        prisma.ticket.findFirst.mockResolvedValue(null);

        await expect(
          service.unlinkAsset('ticket-1', 'asset-1', staffUser),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(assetsService.unlinkFromTicket).not.toHaveBeenCalled();
      });

      it('delegates to AssetsService once the ticket is visible', async () => {
        prisma.ticket.findFirst.mockResolvedValue(buildTicket());

        await service.unlinkAsset('ticket-1', 'asset-1', staffUser);

        expect(assetsService.unlinkFromTicket).toHaveBeenCalledWith(
          'ticket-1',
          'asset-1',
          staffUser,
        );
      });
    });
  });

  describe('audit events', () => {
    const SENTINEL_TEXT = 'SENTINEL-FREE-TEXT-should-not-be-audited';

    function recorded() {
      return audit.record.mock.calls.map((c) => c[0]);
    }

    it('records ticket.created with identifiers, not subject/description text', async () => {
      const created = buildTicket({
        subject: SENTINEL_TEXT,
        description: SENTINEL_TEXT,
        priority: TicketPriority.High,
      });
      prisma.ticket.create.mockResolvedValue(created);
      prisma.ticketHistory.create.mockResolvedValue({});
      prisma.ticket.findFirst.mockResolvedValue(created);

      await service.create(
        { subject: SENTINEL_TEXT, description: SENTINEL_TEXT },
        authUser(),
      );

      const [event] = recorded();
      expect(event.action).toBe('ticket.created');
      expect(event.actorId).toBe('employee-1');
      expect(event.entityId).toBe('ticket-1');
      expect(event.metadata.priority).toBe('High');
      expect(JSON.stringify(recorded())).not.toContain(SENTINEL_TEXT);
    });

    it('records ticket.updated with the changed field NAMES only', async () => {
      const before = buildTicket();
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(before);
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.createMany.mockResolvedValue({});

      await service.update(
        'ticket-1',
        { subject: SENTINEL_TEXT, description: SENTINEL_TEXT },
        staffUser,
      );

      const [event] = recorded();
      expect(event.action).toBe('ticket.updated');
      expect(event.metadata).toEqual({
        changedFields: ['subject', 'description'],
      });
      expect(JSON.stringify(recorded())).not.toContain(SENTINEL_TEXT);
    });

    it('records nothing for a no-op update', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket());
      await service.update('ticket-1', { subject: 'Laptop broken' }, staffUser);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('records ticket.assigned then ticket.unassigned with old/new assignee ids', async () => {
      const agent2 = buildUserRecord({ id: 'agent-2', role: Role.SupportAgent });
      prisma.ticket.findFirst.mockResolvedValue(buildTicket({ assigneeId: null }));
      usersService.findById.mockResolvedValue(agent2);
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.create.mockResolvedValue({});

      await service.assign('ticket-1', { assigneeId: 'agent-2' }, staffUser);
      expect(recorded()[0].action).toBe('ticket.assigned');
      expect(recorded()[0].metadata).toEqual({ from: null, to: 'agent-2' });

      audit.record.mockClear();
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ assigneeId: 'agent-2' }),
      );
      await service.assign('ticket-1', { assigneeId: null }, staffUser);
      expect(recorded()[0].action).toBe('ticket.unassigned');
      expect(recorded()[0].metadata).toEqual({ from: 'agent-2', to: null });
    });

    it('does not record a failed (409) assignment', async () => {
      prisma.ticket.findFirst.mockResolvedValue(buildTicket({ assigneeId: null }));
      usersService.findById.mockResolvedValue(
        buildUserRecord({ id: 'agent-2', role: Role.SupportAgent }),
      );
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.assign('ticket-1', { assigneeId: 'agent-2' }, staffUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('records ticket.priority_changed with old/new priority', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ priority: TicketPriority.Medium }),
      );
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.create.mockResolvedValue({});

      await service.updatePriority(
        'ticket-1',
        { priority: TicketPriority.Critical },
        staffUser,
      );

      expect(recorded()[0].action).toBe('ticket.priority_changed');
      expect(recorded()[0].metadata).toEqual({
        from: 'Medium',
        to: 'Critical',
      });
    });

    it('records ticket.status_changed with old/new status', async () => {
      prisma.ticket.findFirst.mockResolvedValue(
        buildTicket({ status: TicketStatus.New }),
      );
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticketHistory.createMany.mockResolvedValue({});

      await service.updateStatus(
        'ticket-1',
        { status: TicketStatus.Open },
        staffUser,
      );

      expect(recorded()[0].action).toBe('ticket.status_changed');
      expect(recorded()[0].metadata).toEqual({ from: 'New', to: 'Open' });
    });
  });
});
