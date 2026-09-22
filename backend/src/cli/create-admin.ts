import * as readline from 'node:readline/promises';
import { PrismaClient, Role } from '@prisma/client';
import { normalizeEmail } from '../users/users.service';

/**
 * create-admin — promotes an EXISTING OpsNow account to `Administrator`.
 *
 * WHY THIS EXISTS
 * A fresh deployment has no administrator and no supported way to make one.
 * `POST /auth/register` always creates an `Employee` and deliberately does
 * not accept a role, and `prisma db seed` calls `resetData()`, which empties
 * every table — it is a development fixture and must never be pointed at a
 * deployment. That left "run some SQL by hand against production" as the
 * only bootstrap path, which is exactly the kind of step that gets done
 * wrong at 2am. This is that step, written down, typed and tested.
 *
 * WHY IT PROMOTES RATHER THAN CREATES
 * It never sets a password, so it never needs to know how one is hashed or
 * what the password policy is. Account creation stays entirely with the
 * register flow, which owns the argon2 parameters and that policy;
 * duplicating either here would create a second, quieter place for them to
 * drift out of step. The operator registers the account through the normal
 * UI or API first, and this command changes one column on it.
 *
 * WHY IT IS NOT AN HTTP ENDPOINT
 * An endpoint that grants `Administrator` has to be guarded by something,
 * and on a brand-new deployment there is no administrator to do the
 * guarding — the bootstrap is circular. Every escape hatch out of that
 * circle (a setup token, a "first caller wins" rule, an env-var-gated
 * route) is a permanent privilege-escalation surface exposed to the
 * internet in exchange for a one-time need. Shell access to the deployment
 * is already the higher privilege, so requiring it costs the operator
 * nothing and adds no attack surface.
 *
 * WHY THE PROMOTION IS NOT AUDITED — READ THIS
 * Nothing is written to `audit_logs`. `AuditAction` in
 * `src/audit/audit.constants.ts` is a closed set: it is mirrored into
 * `frontend/src/types/api.ts` and held in step by a drift-guard test, so
 * adding a role-change action is a cross-package change and is out of scope
 * for this gap. The consequence is real and must not be glossed over — a
 * promotion performed here leaves NO trace in the application's audit
 * trail. Instead the command prints a single `RECORD` line, and the
 * operator is responsible for filing that line wherever this deployment
 * keeps its change record. Giving role changes a first-class audit action
 * is tracked separately.
 *
 * WHY THE WRITE IS A CONDITIONAL updateMany AND NOT AN update
 * The role is read, shown to the operator, confirmed, and only then
 * written, so there is a window in which the row can change underneath that
 * decision. `updateMany` pins `role` to the value that was read (and
 * `deletedAt` to null) and reports how many rows it matched: 0 means the
 * account was changed or soft-deleted in the meantime, and the operator's
 * confirmation no longer describes the row in front of them. A bare
 * `update` by id would overwrite it regardless. This is the same
 * compare-and-set the ticket, asset and knowledge-base services already use
 * for their own contended writes.
 *
 * USAGE
 *   node dist/cli/create-admin.js <email> [--yes] [--dry-run]
 *                                         [--allow-inactive] [--help]
 *
 * In development: `npm run create:admin -- <email> --dry-run`.
 */

/** Prefix on every line this command prints, so its output is greppable out
 * of a deployment log that is interleaved with the application's own. */
const COMMAND = 'create-admin';

export const USAGE = `Usage: node dist/cli/create-admin.js <email> [options]

Promotes an existing, non-deleted OpsNow account to the Administrator role.
The account must already exist: this command never creates one and never
sets a password. Register the account normally first.

Options:
  --yes              Skip the interactive confirmation. Required when stdin
                     is not a terminal, e.g. under "docker compose run".
  --dry-run          Look the account up and report what would happen.
                     Writes nothing, and never prompts.
  --allow-inactive   Promote even if the account is disabled (isActive=false).
  --help, -h         Print this message.

Exit codes:
  0  promoted, already an Administrator, dry run, or --help
  1  not found, refused, lost a concurrent race, or an unexpected error
  2  the command line could not be understood

This promotion is NOT recorded in the audit log. Keep the RECORD line the
command prints and file it in this deployment's change record.`;

// --------------------------------------------------------------- args ----

export type ParsedArgs =
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ok';
      /** Already normalized — see `normalizeEmail`. */
      readonly email: string;
      readonly yes: boolean;
      readonly dryRun: boolean;
      readonly allowInactive: boolean;
    };

/**
 * A typo guard, not RFC 5322 validation. It only has to stop an operator
 * pasting a username, a user id or a shell-mangled string and being told
 * "not found" when the real problem was the argument. Erring strict is
 * cheap: a false rejection costs one retry, whereas the alternative — being
 * permissive — buys nothing, because anything wrong that gets through
 * simply fails the lookup anyway.
 */
function looksLikeEmailAddress(value: string): boolean {
  const parts = value.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;
  if (localPart.length === 0) {
    return false;
  }

  // A dot-bearing domain, with the dot neither leading nor trailing, rejects
  // `jane@localhost` and `jane@example.` alike.
  const dot = domain.indexOf('.');
  if (dot <= 0 || dot === domain.length - 1) {
    return false;
  }

  // `normalizeEmail` only trims the ends, so interior whitespace survives it
  // — which is what a half-quoted shell argument looks like.
  return !/\s/.test(value);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  // Scanned in its own pass, ahead of everything else, so `--help` still
  // works alongside an otherwise invalid command line. Someone who got the
  // arguments wrong is precisely who needs the usage text; refusing to print
  // it until they fix the rest of the line first would be backwards.
  if (argv.includes('--help') || argv.includes('-h')) {
    return { kind: 'help' };
  }

  let yes = false;
  let dryRun = false;
  let allowInactive = false;
  const positional: string[] = [];

  for (const arg of argv) {
    switch (arg) {
      case '--yes':
        yes = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--allow-inactive':
        allowInactive = true;
        break;
      default:
        if (arg.startsWith('-')) {
          // Rejected rather than ignored: a mistyped `--dry-runn` that is
          // silently dropped turns a rehearsal into a real promotion.
          return { kind: 'error', message: `unknown option "${arg}".` };
        }
        positional.push(arg);
    }
  }

  if (positional.length === 0) {
    return { kind: 'error', message: 'an email address is required.' };
  }

  if (positional.length > 1) {
    return {
      kind: 'error',
      message:
        `expected exactly one email address but got ${positional.length} ` +
        `arguments (${positional.join(', ')}). This command promotes one ` +
        'account at a time.',
    };
  }

  const email = normalizeEmail(positional[0]);
  if (!looksLikeEmailAddress(email)) {
    return {
      kind: 'error',
      message: `"${positional[0]}" does not look like an email address.`,
    };
  }

  return { kind: 'ok', email, yes, dryRun, allowInactive };
}

// ------------------------------------------------------- data access ----

/**
 * The user columns this command reads. `passwordHash` is absent on purpose,
 * and the query below names these fields explicitly, so the hash is never
 * loaded into the process at all — there is nothing sensitive here for a
 * stray log line to spill.
 */
export interface PromotableUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: Role;
  readonly isActive: boolean;
}

export const PROMOTABLE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
} as const;

/**
 * The only two database calls this command makes. Narrowing the dependency
 * to this interface does two things: the spec can drive every outcome with a
 * plain object instead of mocking `PrismaClient`, and the blast radius
 * becomes legible from the type alone — it can read users and it can change
 * a role, and it cannot delete anything or touch any other table.
 */
export interface AdminUserStore {
  findFirst(args: {
    where: { email: string; deletedAt: null };
    select: typeof PROMOTABLE_USER_SELECT;
  }): Promise<PromotableUser | null>;

  updateMany(args: {
    where: { id: string; deletedAt: null; role: Role };
    data: { role: Role };
  }): Promise<{ count: number }>;
}

/**
 * Adapts the generated Prisma client to `AdminUserStore`. Written out rather
 * than passing `prisma.user` through directly: the client's methods are
 * generic over their arguments, and pinning the two calls here means the
 * narrow interface above — not Prisma's inference — is what the rest of this
 * file is type-checked against.
 */
function prismaUserStore(prisma: PrismaClient): AdminUserStore {
  return {
    findFirst: (args) => prisma.user.findFirst(args),
    updateMany: (args) => prisma.user.updateMany(args),
  };
}

// -------------------------------------------------------------- core ----

/**
 * Asked once: after the account has been found and every refusal ruled out,
 * and immediately before the write. Injected rather than called directly so
 * the decision logic stays free of I/O and the spec can drive both answers.
 */
export type ConfirmPromotion = (user: PromotableUser) => Promise<boolean>;

export interface PromoteOptions {
  readonly allowInactive: boolean;
  readonly dryRun: boolean;
  /**
   * Required, with no default. An implicit "yes" is not a safe fallback for
   * the one command in this system that hands out unrestricted access.
   */
  readonly confirm: ConfirmPromotion;
}

/**
 * Every way this can end. Expected outcomes are values, not exceptions: each
 * one maps to a specific message and exit code in `formatOutcome`, and a
 * discriminated union is what makes it impossible to add a case there and
 * forget to give it one.
 */
export type PromotionOutcome =
  | { readonly status: 'not-found'; readonly email: string }
  | { readonly status: 'already-administrator'; readonly user: PromotableUser }
  | { readonly status: 'inactive'; readonly user: PromotableUser }
  | { readonly status: 'cancelled'; readonly user: PromotableUser }
  | { readonly status: 'would-promote'; readonly user: PromotableUser }
  | {
      readonly status: 'promoted';
      readonly user: PromotableUser;
      readonly previousRole: Role;
    }
  | { readonly status: 'conflict'; readonly user: PromotableUser };

export async function promoteToAdministrator(
  users: AdminUserStore,
  email: string,
  options: PromoteOptions,
): Promise<PromotionOutcome> {
  // Matches `UsersService.findByEmail` exactly: normalized email, and not
  // soft-deleted. Postgres' unique index on `email` is case-sensitive and
  // the application normalizes on every read and write, so a command that
  // normalized differently would simply fail to find real accounts.
  //
  // A soft-deleted row reports as not-found rather than being resurrected:
  // restoring a deleted account is a different decision from promoting a
  // live one, and this command must not make it by accident.
  const user = await users.findFirst({
    where: { email, deletedAt: null },
    select: PROMOTABLE_USER_SELECT,
  });

  if (!user) {
    return { status: 'not-found', email };
  }

  // Checked ahead of the isActive guard because there is no write here for
  // that guard to protect. Re-running the command is a no-op rather than an
  // error, which is what makes it safe to put in a runbook — and
  // `formatOutcome` still surfaces a disabled account in this branch, so
  // that fact is not lost by taking the early exit.
  if (user.role === Role.Administrator) {
    return { status: 'already-administrator', user };
  }

  // A disabled account cannot sign in, so promoting one quietly produces an
  // administrator nobody can use — and leaves a dormant privileged account
  // behind if it is ever re-enabled. Refused by default, overridable when
  // that is genuinely the intent (e.g. promote first, enable second).
  if (!user.isActive && !options.allowInactive) {
    return { status: 'inactive', user };
  }

  if (options.dryRun) {
    // Returned before `confirm`, so a rehearsal never prompts and never
    // blocks a non-interactive shell.
    return { status: 'would-promote', user };
  }

  if (!(await options.confirm(user))) {
    return { status: 'cancelled', user };
  }

  // Conditional update — see the file header for why this is not `update`.
  const { count } = await users.updateMany({
    where: { id: user.id, deletedAt: null, role: user.role },
    data: { role: Role.Administrator },
  });

  if (count !== 1) {
    return { status: 'conflict', user };
  }

  return { status: 'promoted', user, previousRole: user.role };
}

// ----------------------------------------------------------- output ----

/**
 * The account, field by field. Deliberately not an object dump: a column
 * added to the `User` model later cannot start appearing in operator output
 * — or in a deployment log — just because it was added.
 */
function describeUser(user: PromotableUser): string {
  return [
    `  id:       ${user.id}`,
    `  email:    ${user.email}`,
    `  name:     ${user.firstName} ${user.lastName}`,
    `  role:     ${user.role}`,
    `  isActive: ${String(user.isActive)}`,
  ].join('\n');
}

/**
 * The copy-pasteable change record: one line, fixed `key=value` shape, with
 * everything a reviewer needs to reconstruct the change — when, which
 * account, and from what to what. This is the ONLY durable evidence that the
 * promotion happened; see the file header.
 */
function formatRecordLine(
  outcome: Extract<PromotionOutcome, { status: 'promoted' }>,
  now: Date,
): string {
  return [
    `${COMMAND}: RECORD`,
    `timestamp=${now.toISOString()}`,
    `userId=${outcome.user.id}`,
    `email=${outcome.user.email}`,
    `previousRole=${outcome.previousRole}`,
    `newRole=${Role.Administrator}`,
  ].join(' ');
}

export interface RenderedOutcome {
  readonly exitCode: number;
  readonly stream: 'stdout' | 'stderr';
  readonly message: string;
  /** Present only when the role actually changed. */
  readonly record?: string;
}

/**
 * Turns an outcome into what the operator sees and what the shell gets.
 * Pure, and takes `now` as an argument rather than reading the clock, so the
 * record line is assertable.
 */
export function formatOutcome(
  outcome: PromotionOutcome,
  now: Date,
): RenderedOutcome {
  switch (outcome.status) {
    case 'not-found':
      return {
        exitCode: 1,
        stream: 'stderr',
        message:
          `no active account found for ${outcome.email}. Register the ` +
          'account first, then re-run this command. A soft-deleted account ' +
          'reports the same way and must be restored before it can be ' +
          'promoted.',
      };

    case 'already-administrator':
      return {
        exitCode: 0,
        stream: 'stdout',
        message:
          `${outcome.user.email} is already an Administrator; nothing to do.` +
          (outcome.user.isActive
            ? ''
            : ' Note: this account is disabled (isActive=false) and cannot ' +
              'sign in until it is re-enabled.'),
      };

    case 'inactive':
      return {
        exitCode: 1,
        stream: 'stderr',
        message:
          `${outcome.user.email} is disabled (isActive=false) and was NOT ` +
          'promoted. Re-enable the account, or pass --allow-inactive to ' +
          'promote it anyway.',
      };

    case 'cancelled':
      return {
        exitCode: 1,
        stream: 'stderr',
        message: `cancelled — ${outcome.user.email} was not changed.`,
      };

    case 'would-promote':
      // The only mode in which nothing else prints the account, because
      // `confirm` — which is where the write paths show it — is skipped.
      return {
        exitCode: 0,
        stream: 'stdout',
        message:
          `dry run: would promote this account from ${outcome.user.role} to ` +
          `${Role.Administrator}. Nothing was written.\n` +
          describeUser(outcome.user),
      };

    case 'conflict':
      return {
        exitCode: 1,
        stream: 'stderr',
        message:
          `${outcome.user.email} changed while this command was running, so ` +
          'nothing was written. Re-run to see its current role.',
      };

    case 'promoted':
      return {
        exitCode: 0,
        stream: 'stdout',
        message:
          `promoted ${outcome.user.email} from ${outcome.previousRole} to ` +
          `${Role.Administrator}.`,
        record: formatRecordLine(outcome, now),
      };
  }
}

// ----------------------------------------------------------- runner ----

/** `--yes`: still shows the operator (and the log) who was promoted, it just
 * does not stop to ask. */
const announceOnly: ConfirmPromotion = (user) => {
  console.log(
    `${COMMAND}: promoting the following account (--yes given):\n${describeUser(user)}`,
  );
  return Promise.resolve(true);
};

const promptForConfirmation: ConfirmPromotion = async (user) => {
  console.log(
    `${COMMAND}: about to grant full administrative access to:\n${describeUser(user)}`,
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(
      `Type "yes" to promote this account to ${Role.Administrator}: `,
    );
    // An exact match rather than a y/n prefix: one deliberate extra
    // keystroke on the command that hands out unrestricted access.
    return answer.trim() === 'yes';
  } finally {
    rl.close();
  }
};

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.kind === 'help') {
    console.log(USAGE);
    return 0;
  }

  if (args.kind === 'error') {
    console.error(`${COMMAND}: ${args.message}\n\n${USAGE}`);
    return 2;
  }

  // Checked before anything touches the database: the remedy is a flag on
  // the command line, so there is no point opening a connection to discover
  // it. A `docker compose run` without a TTY lands here, and silently
  // auto-confirming in that case — where nobody is watching — is precisely
  // the behaviour this command must not have.
  if (!args.yes && !args.dryRun && !process.stdin.isTTY) {
    console.error(
      `${COMMAND}: refusing to promote without confirmation because stdin ` +
        'is not a terminal. Re-run with --yes to confirm non-interactively, ' +
        'or with --dry-run to see what would happen.',
    );
    return 1;
  }

  // Constructed FIRST, deliberately, for the same reason as
  // test/support/cleanup-e2e-data.ts: the Prisma client is what loads
  // backend/.env, so DATABASE_URL is undefined until this line runs when the
  // command is started through `npm run create:admin`. A value already in
  // the environment still wins — Prisma never overwrites one — so the check
  // below always sees the value the client will actually connect with.
  const prisma = new PrismaClient();
  try {
    if (!process.env.DATABASE_URL) {
      // Reported as a missing setting rather than left to surface as a
      // Prisma initialization stack trace, which reads like a bug in this
      // command. The value itself is never echoed back: it carries the
      // database password.
      console.error(
        `${COMMAND}: DATABASE_URL is not set, so there is no database to ` +
          'connect to. Set it in the environment (or in backend/.env for ' +
          'local use) and re-run.',
      );
      return 1;
    }

    const outcome = await promoteToAdministrator(
      prismaUserStore(prisma),
      args.email,
      {
        allowInactive: args.allowInactive,
        dryRun: args.dryRun,
        confirm: args.yes ? announceOnly : promptForConfirmation,
      },
    );

    const rendered = formatOutcome(outcome, new Date());
    if (rendered.stream === 'stderr') {
      console.error(`${COMMAND}: ${rendered.message}`);
    } else {
      console.log(`${COMMAND}: ${rendered.message}`);
    }

    if (rendered.record !== undefined) {
      console.log(rendered.record);
      console.log(
        `${COMMAND}: this promotion is NOT in the audit log. File the RECORD ` +
          "line above in this deployment's change record.",
      );
    }

    return rendered.exitCode;
  } finally {
    // On every path, including the thrown ones: otherwise the process sits
    // on an open connection pool instead of exiting.
    await prisma.$disconnect();
  }
}

async function runFromCommandLine(): Promise<void> {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error: unknown) {
    // Anything unexpected — the database unreachable, a Prisma
    // initialization failure. Reduced to a message so the operator gets
    // something actionable instead of an unhandled-rejection crash dump.
    console.error(
      `${COMMAND}: failed —`,
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  }
}

// Guarded rather than called at the top level: the package is CommonJS and
// the spec imports this file, so without the guard every test run would
// execute the command. `void` because the runner owns its own error handling
// and the process exits on its own once the event loop drains.
if (require.main === module) {
  void runFromCommandLine();
}
