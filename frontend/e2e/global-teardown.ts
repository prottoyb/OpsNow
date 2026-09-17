import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Deletes the tickets and assets this suite created, and only those.
 *
 * The work is done by `backend/test/support/cleanup-e2e-data.ts` (exposed as
 * `npm run test:e2e:cleanup`), which lives in the backend because that is
 * where the Prisma client and the database credentials are. It matches the
 * fixed `[E2E]` ticket subject prefix and the fixed `E2E-` asset tag prefix
 * rather than this run's id, so leftovers from a crashed run are swept up by
 * the next one.
 *
 * Best effort by design: teardown runs after a pass or a failure, and a
 * cleanup problem is logged but never thrown — failing the teardown would
 * mask the actual test result.
 */
export default async function globalTeardown(): Promise<void> {
  const backendDir = resolve(import.meta.dirname, '..', '..', 'backend');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  await new Promise<void>((resolvePromise) => {
    const child = spawn(npm, ['run', 'test:e2e:cleanup'], {
      cwd: backendDir,
      stdio: 'inherit',
      // Required on Windows, not incidental: since Node's CVE-2024-27980 fix,
      // spawning a .cmd shim without a shell fails outright with EINVAL
      // (verified on Node 24). It is safe here because nothing external is
      // interpolated — the command and arguments are fixed literals and `cwd`
      // is passed as a spawn option rather than built into a command string.
      shell: process.platform === 'win32',
    });

    child.on('error', (error) => {
      console.warn('e2e teardown: could not run the cleanup script:', error.message);
      resolvePromise();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.warn(
          `e2e teardown: cleanup exited with code ${code}. Tagged [E2E] tickets and E2E- assets may remain; re-running the suite will remove them.`,
        );
      }
      resolvePromise();
    });
  });
}
