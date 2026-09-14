import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentVisibility, Role, TicketPriority, TicketStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
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
  let usersService: { findById: jest.Mock };
  let ticketCategoriesService: { findActiveById: jest.Mock };

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

    service = new TicketsService(
      prisma as unknown as PrismaService,
      usersService as unknown as UsersService,
      ticketCategoriesService as unknown as TicketCategoriesService,
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
      prisma.ticket.create.mockResolvedValue(buildTicket());
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

    it('updates priority and writes a history row', async () => {
      const before = buildTicket({ priority: TicketPriority.Medium });
      prisma.ticket.findFirst
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, priority: TicketPriority.Critical });
      prisma.ticket.update.mockResolvedValue({});
      prisma.ticketHistory.create.mockResolvedValue({});

      await service.updatePriority(
        'ticket-1',
        { priority: TicketPriority.Critical },
        staffUser,
      );

      expect(prisma.ticketHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fieldName: 'priority',
          oldValue: TicketPriority.Medium,
          newValue: TicketPriority.Critical,
        }),
      });
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

    it('allows staff to create an Internal note', async () => {
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
});
