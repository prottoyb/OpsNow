import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev/preview proxy for the NestJS API.
 *
 * The backend deliberately enables NO CORS (`configureApp()` in
 * `backend/src/configure-app.ts`) and `POST /auth/refresh` and
 * `POST /auth/logout` both call `assertTrustedOrigin()`, which rejects any
 * request whose `Origin` host differs from its `Host` header. The refresh
 * cookie is additionally `SameSite=Strict` with `path=/api/v1/auth`.
 *
 * A browser on :5173 talking directly to :3000 therefore fails three ways
 * at once (no CORS headers, 403 origin mismatch, cookie never sent). This
 * proxy makes the API same-origin from the browser's point of view, which
 * is the only configuration in which auth works. Three traps, all of which
 * silently break authentication if you get them wrong:
 *
 *  1. `changeOrigin` MUST stay `false` (the Vite default — it is not set
 *     below on purpose). Setting it to `true` rewrites the forwarded
 *     `Host` header to `localhost:3000` while the browser still sends
 *     `Origin: http://localhost:5173`, so `assertTrustedOrigin()` sees a
 *     mismatch and 403s every refresh and logout.
 *  2. There must be NO `rewrite`. The refresh cookie's `path=/api/v1/auth`
 *     is matched by the browser against the URL it sees, not the URL the
 *     backend sees. Any rewrite that changes that prefix means the browser
 *     stops sending the cookie back and the session silently dies.
 *  3. `vite preview` does NOT read `server.proxy`; it has its own
 *     `preview.proxy` key. Both must be configured or a production-build
 *     smoke test appears to be broken auth.
 *
 * The API base URL is a hardcoded relative `/api/v1` (see
 * `src/lib/api/client.ts`). There is deliberately no `VITE_API_BASE_URL`
 * override: pointing the app at an absolute origin reintroduces all three
 * failures above.
 */
const apiProxy = {
  '/api': {
    target: 'http://localhost:3000',
  },
} as const;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
