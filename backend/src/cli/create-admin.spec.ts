import { Role } from '@prisma/client';
import {
  AdminUserStore,
  ConfirmPromotion,
  formatOutcome,
  parseArgs,
  PROMOTABLE_USER_SELECT,
  PromotableUser,
  promoteToAdministrator,
  PromotionOutcome,
  USAGE,
} from './create-admin';

/*
 * Importing this module must not run the command — the entry point is
 * guarded by `require.main === module`. If that guard were ever removed,
 * this file would try to open a database connection on import and the whole
 * suite would fail, so the guard is covered by the mere existence of these
 * tests rather than by an assertion.
 */

const employee: PromotableUser = {
  id: 'user-1',
  email: 'jane@opsnow.local',
  firstName: 'Jane',
  lastName: 'Doe',
  role: Role.Employee,
  isActive: true,
};

const confirmYes: ConfirmPromotion = () => Promise.resolve(true);
const confirmNo: ConfirmPromotion = () => Promise.resolve(false);
const confirmMustNotBeAsked: ConfirmPromotion = () => {
  throw new Error('confirmation must not be requested on this path');
};

function makeStore(options: {
  user?: PromotableUser | null;
  updateCount?: number;
}): {
  store: AdminUserStore;
  findFirst: jest.Mock;
  updateMany: jest.Mock;
} {
  const findFirst = jest.fn().mockResolvedValue(options.user ?? null);
  const updateMany = jest
    .fn()
    .mockResolvedValue({ count: options.updateCount ?? 1 });
  return { store: { findFirst, updateMany }, findFirst, updateMany };
}

describe('parseArgs', () => {
  it('accepts a bare email and defaults every flag to off', () => {
    expect(parseArgs(['jane@opsnow.local'])).toEqual({
      kind: 'ok',
      email: 'jane@opsnow.local',
      yes: false,
      dryRun: false,
      allowInactive: false,
    });
  });

  it('normalizes the email exactly as the application does', () => {
    // Postgres' unique index on `email` is case-sensitive, so a command that
    // did not normalize identically would fail to find real accounts.
    expect(parseArgs(['  Jane.Doe@OpsNow.Local  '])).toMatchObject({
      kind: 'ok',
      email: 'jane.doe@opsnow.local',
    });
  });

  it('accepts every flag, in any position', () => {
    expect(
      parseArgs(['--dry-run', 'jane@opsnow.local', '--allow-inactive', '--yes']),
    ).toEqual({
      kind: 'ok',
      email: 'jane@opsnow.local',
      yes: true,
      dryRun: true,
      allowInactive: true,
    });
  });

  it.each(['--help', '-h'])('treats %s as a request for usage', (flag) => {
    expect(parseArgs([flag])).toEqual({ kind: 'help' });
  });

  it('honours --help even alongside an otherwise invalid command line', () => {
    expect(parseArgs(['--nonsense', '--help'])).toEqual({ kind: 'help' });
  });

  it('rejects a missing email', () => {
    expect(parseArgs([])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['--yes'])).toMatchObject({ kind: 'error' });
  });

  it('rejects more than one positional argument', () => {
    const result = parseArgs(['jane@opsnow.local', 'john@opsnow.local']);

    expect(result.kind).toBe('error');
    // Promoting two accounts from one confirmation is not something this
    // command should ever be able to do by accident.
    expect(result).toMatchObject({
      message: expect.stringContaining('one account at a time'),
    });
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    // A silently dropped `--dry-runn` would turn a rehearsal into a real
    // promotion.
    expect(parseArgs(['jane@opsnow.local', '--dry-runn'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('--dry-runn'),
    });
  });

  it.each([
    ['no at-sign', 'jane.opsnow.local'],
    ['two at-signs', 'jane@@opsnow.local'],
    ['an empty local part', '@opsnow.local'],
    ['a dotless domain', 'jane@localhost'],
    ['a trailing dot in the domain', 'jane@opsnow.'],
    ['a leading dot in the domain', 'jane@.local'],
    ['interior whitespace', 'jane doe@opsnow.local'],
  ])('rejects %s', (_label, value) => {
    expect(parseArgs([value])).toMatchObject({ kind: 'error' });
  });

  it('documents the audit gap in the usage text', () => {
    // The operator has to know they are responsible for recording this.
    expect(USAGE).toContain('NOT recorded in the audit log');
  });
});

describe('promoteToAdministrator', () => {
  it('looks the account up by normalized email, excluding soft-deleted rows', async () => {
    const { store, findFirst } = makeStore({ user: employee });

    await promoteToAdministrator(store, 'jane@opsnow.local', {
      allowInactive: false,
      dryRun: false,
      confirm: confirmYes,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'jane@opsnow.local', deletedAt: null },
      select: PROMOTABLE_USER_SELECT,
    });
  });

  it('never selects the password hash', () => {
    expect(PROMOTABLE_USER_SELECT).not.toHaveProperty('passwordHash');
  });

  it('reports not-found when no live account matches, and writes nothing', async () => {
    const { store, updateMany } = makeStore({ user: null });

    const outcome = await promoteToAdministrator(store, 'ghost@opsnow.local', {
      allowInactive: false,
      dryRun: false,
      confirm: confirmMustNotBeAsked,
    });

    expect(outcome).toEqual({
      status: 'not-found',
      email: 'ghost@opsnow.local',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is an idempotent no-op when the account is already an Administrator', async () => {
    const admin = { ...employee, role: Role.Administrator };
    const { store, updateMany } = makeStore({ user: admin });

    const outcome = await promoteToAdministrator(store, admin.email, {
      allowInactive: false,
      dryRun: false,
      confirm: confirmMustNotBeAsked,
    });

    expect(outcome).toEqual({ status: 'already-administrator', user: admin });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses a disabled account by default, and writes nothing', async () => {
    const disabled = { ...employee, isActive: false };
    const { store, updateMany } = makeStore({ user: disabled });

    const outcome = await promoteToAdministrator(store, disabled.email, {
      allowInactive: false,
      dryRun: false,
      confirm: confirmMustNotBeAsked,
    });

    expect(outcome).toEqual({ status: 'inactive', user: disabled });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('promotes a disabled account when --allow-inactive is given', async () => {
    const disabled = { ...employee, isActive: false };
    const { store, updateMany } = makeStore({ user: disabled });

    const outcome = await promoteToAdministrator(store, disabled.email, {
      allowInactive: true,
      dryRun: false,
      confirm: confirmYes,
    });

    expect(outcome).toMatchObject({ status: 'promoted' });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('reports what a dry run would do without writing or prompting', async () => {
    const { store, updateMany } = makeStore({ user: employee });

    const outcome = await promoteToAdministrator(store, employee.email, {
      allowInactive: false,
      dryRun: true,
      confirm: confirmMustNotBeAsked,
    });

    expect(outcome).toEqual({ status: 'would-promote', user: employee });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the operator declines', async () => {
    const { store, updateMany } = makeStore({ user: employee });

    const outcome = await promoteToAdministrator(store, employee.email, {
      allowInactive: false,
      dryRun: false,
      confirm: confirmNo,
    });

    expect(outcome).toEqual({ status: 'cancelled', user: employee });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('writes with a conditional update pinned to the role it read', async () => {
    const { store, updateMany } = makeStore({ user: employee });

    const outcome = await promoteToAdministrator(store, employee.email, {
      allowInactive: false,
      dryRun: false,
      confirm: confirmYes,
    });

    // The `role` pin is what makes a concurrent change lose the race rather
    // than be silently overwritten; `deletedAt` keeps a soft delete landing
    // mid-command from being undone.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', deletedAt: null, role: Role.Employee },
      data: { role: Role.Administrator },
    });
    expect(outcome).toEqual({
      status: 'promoted',
      user: employee,
      previousRole: Role.Employee,
    });
  });

  it('reports a conflict when the conditional update matches no rows', async () => {
    const { store } = makeStore({ user: employee, updateCount: 0 });

    const outcome = await promoteToAdministrator(store, employee.email, {
      allowInactive: false,
      dryRun: false,
      confirm: confirmYes,
    });

    expect(outcome).toEqual({ status: 'conflict', user: employee });
  });

  it('reports a conflict when the update matches more rows than expected', async () => {
    // Cannot happen against the real schema (`id` is the primary key), but
    // the guard is `count !== 1` rather than `count === 0` precisely so that
    // an impossible result is refused instead of reported as success.
    const { store } = makeStore({ user: employee, updateCount: 2 });

    const outcome = await promoteToAdministrator(store, employee.email, {
      allowInactive: false,
      dryRun: false,
      confirm: confirmYes,
    });

    expect(outcome).toEqual({ status: 'conflict', user: employee });
  });
});

describe('formatOutcome', () => {
  const now = new Date('2026-09-22T09:30:00.000Z');

  // Columns are ordered status, exitCode, outcome so the generated test name
  // reads "exits <status> with code <n>".
  it.each<[PromotionOutcome['status'], number, PromotionOutcome]>([
    ['not-found', 1, { status: 'not-found', email: 'ghost@opsnow.local' }],
    [
      'already-administrator',
      0,
      { status: 'already-administrator', user: employee },
    ],
    ['inactive', 1, { status: 'inactive', user: employee }],
    ['cancelled', 1, { status: 'cancelled', user: employee }],
    ['would-promote', 0, { status: 'would-promote', user: employee }],
    ['conflict', 1, { status: 'conflict', user: employee }],
    [
      'promoted',
      0,
      { status: 'promoted', user: employee, previousRole: Role.Employee },
    ],
  ])('exits %s with code %i', (_status, exitCode, outcome) => {
    expect(formatOutcome(outcome, now).exitCode).toBe(exitCode);
  });

  it('sends only the failure outcomes to stderr', () => {
    expect(formatOutcome({ status: 'inactive', user: employee }, now).stream).toBe(
      'stderr',
    );
    expect(
      formatOutcome({ status: 'would-promote', user: employee }, now).stream,
    ).toBe('stdout');
  });

  it('tells the operator that --allow-inactive overrides the refusal', () => {
    const rendered = formatOutcome({ status: 'inactive', user: employee }, now);

    expect(rendered.message).toContain('--allow-inactive');
  });

  it('flags a disabled account even on the already-administrator no-op', () => {
    // This branch exits before `confirm`, so nothing else would show the
    // operator that the account cannot actually sign in.
    const rendered = formatOutcome(
      {
        status: 'already-administrator',
        user: { ...employee, role: Role.Administrator, isActive: false },
      },
      now,
    );

    expect(rendered.message).toContain('isActive=false');
  });

  it('shows the full account on a dry run, because nothing else does', () => {
    const rendered = formatOutcome(
      { status: 'would-promote', user: employee },
      now,
    );

    expect(rendered.message).toContain('user-1');
    expect(rendered.message).toContain('Jane Doe');
    expect(rendered.message).toContain('Nothing was written');
  });

  it('emits the copy-pasteable record line only when the role changed', () => {
    const promoted = formatOutcome(
      { status: 'promoted', user: employee, previousRole: Role.Employee },
      now,
    );

    // The promotion is not audited, so this line is the only durable
    // evidence it happened — it must carry when, who and what changed.
    expect(promoted.record).toBe(
      'create-admin: RECORD timestamp=2026-09-22T09:30:00.000Z ' +
        'userId=user-1 email=jane@opsnow.local ' +
        'previousRole=Employee newRole=Administrator',
    );

    for (const outcome of [
      { status: 'not-found', email: 'ghost@opsnow.local' },
      { status: 'already-administrator', user: employee },
      { status: 'inactive', user: employee },
      { status: 'cancelled', user: employee },
      { status: 'would-promote', user: employee },
      { status: 'conflict', user: employee },
    ] satisfies PromotionOutcome[]) {
      expect(formatOutcome(outcome, now).record).toBeUndefined();
    }
  });

  it('never leaks a secret into operator output', () => {
    // `PromotableUser` has no `passwordHash` field, so this is really a
    // regression guard on the shape: if the select ever widened and the
    // renderer started dumping the object, this catches it.
    const rendered = formatOutcome(
      { status: 'promoted', user: employee, previousRole: Role.Employee },
      now,
    );

    expect(`${rendered.message}${rendered.record ?? ''}`).not.toMatch(
      /hash|password/i,
    );
  });
});
