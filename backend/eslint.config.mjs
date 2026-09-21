import tseslint from 'typescript-eslint';

/*
 * Backend lint (Phase 13).
 *
 * Until now `tsc --noEmit` was the only static gate on the backend, which
 * left a class of problem uncovered that the compiler does not consider an
 * error: a floating promise, an `any` leaking through a boundary, a
 * misused `await`. Those matter here in particular — almost every service
 * method is async and talks to Prisma, so an unawaited write is a silent
 * data bug rather than a type error.
 *
 * `.mjs` rather than `.js`, because the package is CommonJS and ESLint's
 * flat config is ESM.
 *
 * Type-aware rules are enabled (`recommendedTypeChecked`) since that is
 * where the value is. The deviations below are deliberate and each has a
 * reason; the goal is a gate that catches real defects, not one that is
 * loud enough to be ignored.
 */
export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'prisma/generated'],
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      /*
       * NestJS's decorator metadata means a decorated class property or
       * parameter is "used" by the framework in a way the rule cannot see,
       * and DTO classes are full of them. The compiler's own unused checks
       * still apply.
       */
      '@typescript-eslint/no-extraneous-class': 'off',

      /*
       * Downgraded to `warn`, which is a statement about how they read in
       * an editor, not about whether they are allowed: `npm run lint`
       * passes `--max-warnings 0`, so a new one still fails the build.
       *
       * The distinction is useful because these fire at boundaries the
       * project does not control — `@nestjs/swagger` and `class-validator`
       * decorators, Prisma's JSON columns, Express' `req.cookies` — where
       * the honest answer is sometimes an assertion plus a comment rather
       * than a real type. Keeping them at `warn` means such a case is
       * settled with a justified inline disable, which a reviewer sees,
       * instead of quietly widening a rule for the whole codebase.
       */
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      /*
       * These stay errors on purpose — they are the reason for adding lint
       * at all. A floating or misused promise against Prisma is a write
       * that may never happen.
       */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',

      /*
       * Bans `any` in code we write. Kept as a warning rather than an
       * error only because the boundary rules above are warnings; an
       * explicit `any` should still be argued for in review.
       */
      '@typescript-eslint/no-explicit-any': 'warn',

      /*
       * A handful of core rules, matching the frontend config's selection.
       * `no-control-regex` is enabled because the codebase already assumes
       * it is (audit.sanitize.ts carries a deliberate disable directive for
       * a regex that genuinely must match control characters), and without
       * the rule that directive is dead.
       */
      'no-control-regex': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    /*
     * Tests legitimately do things production code should not: build
     * deliberately malformed payloads, reach into private state, and assert
     * on `any`-shaped response bodies from supertest.
     */
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      /*
       * A Prisma `$transaction` mock is written `jest.fn(async (fn) =>
       * fn(tx))`: the `async` is what makes it return a promise, which is
       * the whole point, so "async function has no await" is noise here.
       */
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
