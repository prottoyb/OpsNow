import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // `e2e/` is Playwright's; Vitest must never try to run it.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    restoreMocks: true,
    /*
     * Pinned so date assertions are reproducible on every machine and in CI.
     *
     * Deliberately NOT 'UTC': a UTC-pinned run would make the date-only
     * fields (`Asset.purchaseDate`, `warrantyExpiresAt`, which arrive as
     * midnight UTC) pass under both a correct UTC-formatted renderer and a
     * buggy local-zone one, hiding exactly the class of bug those tests
     * exist to catch. A negative-offset zone keeps the two distinguishable:
     * under it, midnight UTC formatted in local time falls on the PREVIOUS
     * calendar day.
     */
    env: { TZ: 'America/New_York' },
  },
});
