# Running OpsNow with Docker

This describes the containerised full-stack run added in Phase 14. It is a
production-shaped local stack: multi-stage images, a non-root API process, no
secrets baked in, health checks, and schema migration as its own one-shot job.

> **Verification status.** Docker was not available on the machine this was
> authored on (no `docker` on `PATH`, no Docker Desktop installed), so the
> images have **never been built locally** and the stack has **never been
> started locally**. CI, however, has built all three images and validated
> `docker compose config`/`nginx -t` successfully on every green run since
> 2026-09-22 (see `.github/workflows/ci.yml`'s `docker` job and the project's
> GitHub Actions history) — real evidence the images build, just not from
> this machine. Everything below was also checked directly: the Compose file
> parses and its service graph was inspected, the production bundles both
> build, and the compiled backend was booted with `NODE_ENV=production` and
> exercised (health, auth throttle). Treat the first **local**
> `docker compose up --build` as an unverified step and expect to fix
> something small. The "If the first build fails" section lists what to
> suspect.

---

## Quick start

```bash
cp .env.docker.example .env
# Fill in POSTGRES_PASSWORD and JWT_ACCESS_SECRET. Both are required and have
# no default — Compose refuses to start without them.

docker compose up --build
```

Then open <http://localhost:8080>.

The database starts **empty**. See [Seeding](#seeding) below — it is a
deliberate manual step, not something the stack does for you.

To stop, keeping the data:

```bash
docker compose down
```

---

## What runs

| Service    | Image                       | Published            | Purpose |
| ---------- | --------------------------- | -------------------- | ------- |
| `postgres` | `postgres:16-alpine`        | `127.0.0.1:5433`     | The database, in its own named volume. |
| `migrate`  | built from `backend/`       | —                    | Runs `prisma migrate deploy` once, then exits. |
| `backend`  | built from `backend/`       | — (internal only)    | The NestJS API on port 3000 inside the network. |
| `frontend` | built from `frontend/`      | `8080`               | nginx: serves the SPA and proxies `/api` to the API. |

Start-up order is enforced by Compose conditions, not by sleeps: `migrate`
waits for Postgres to pass `pg_isready`, `backend` waits for `migrate` to
**exit successfully**, and `frontend` waits for `backend` to report healthy.

### Why the API is not published

`backend` has no `ports:` entry, and that is deliberate.

OpsNow's refresh cookie is `SameSite=Strict` and scoped to
`path=/api/v1/auth`, the backend enables no CORS at all, and
`POST /auth/refresh` and `POST /auth/logout` reject any request whose `Origin`
host differs from their own `Host`. The API therefore only works when the
browser sees it as same-origin — which, here, means through the frontend's
nginx proxy at `http://localhost:8080/api`.

Publishing port 3000 as well would add a second route that cannot authenticate
and would only ever produce confusing 403s.

If you need to reach the API directly for debugging, do it from inside the
network rather than by publishing the port:

```bash
docker compose exec backend node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(console.log)"
```

---

## It does not touch your local development database

This matters enough to state explicitly. The stack is self-contained:

- Postgres runs **in a container**, with its own named volume
  (`opsnow-postgres-data`), and the database is called `opsnow` — **not**
  `opsnow_dev`. Nothing in the stack can read, migrate or drop the database
  `npm run start:dev` uses.
- The host port is **5433**, not 5432, so it cannot collide with a Postgres
  already running on your machine.
- Nothing is seeded automatically, and nothing is ever reset.
- `docker compose down` leaves the volume alone. Only
  `docker compose down -v` deletes it, and no script in this project runs
  that for you.

You can run the containerised stack and your ordinary
`npm run start:dev` / `npm run dev` workflow side by side. They use different
databases, different ports (8080 vs 5173, 5433 vs 5432) and different
environment files (`.env` at the repository root vs `backend/.env`).

---

## Migrations

The `migrate` service runs exactly one command:

```
npx prisma migrate deploy
```

`migrate deploy` applies pending migrations in order and fails if the
database has drifted. It never generates a migration, never resets, and never
drops anything.

It is deliberately **not** `migrate dev` and **not** `db push`. Both of those
can drop and recreate the schema to make it match, which is correct on a
developer's laptop and catastrophic anywhere that holds real data.

It is also deliberately a **separate one-shot service** rather than a step in
the API's start-up, for two reasons: migrations then run exactly once no
matter how many API replicas start, and a failed migration fails visibly as
its own unit instead of looking like a crash-looping API.

To re-run migrations after adding one:

```bash
docker compose build migrate && docker compose run --rm migrate
```

### Seeding

`prisma db seed` calls `resetData()`, which **deletes every table** before
inserting. That is why nothing in this stack runs it for you.

If you want the demo accounts and sample data in the containerised database,
run it yourself, deliberately, knowing it wipes what is there:

```bash
# Uses the host toolchain against the containerised database.
cd backend
DATABASE_URL="postgresql://opsnow:<your password>@localhost:5433/opsnow?schema=public" npm run prisma:seed
```

Note the port: **5433**, the containerised database. Pointing this at 5432
would wipe your local development database instead.

---

## Configuration

Every value comes from the environment. Nothing is baked into an image, and
`.dockerignore` excludes `.env` from both build contexts so a local secrets
file cannot end up in a layer.

`POSTGRES_PASSWORD` and `JWT_ACCESS_SECRET` have **no defaults**: Compose
fails with a named error if either is missing. A defaulted credential is how
a throwaway password ends up in production, so there is no fallback to fall
back to. The application's own Joi schema independently refuses a
`JWT_ACCESS_SECRET` shorter than 32 characters.

See `.env.docker.example` for the full list. Two entries are worth calling
out:

- **`TRUST_PROXY_HOPS` is fixed at `1`** in `docker-compose.yml`, not
  configurable per deployment of this stack, because exactly one proxy (the
  frontend's nginx) sits in front of the API here. It decides what `req.ip`
  means, and `req.ip` is what the auth throttle counts and what every audit
  row records. See ADR-026.
- **`AI_PROVIDER` only accepts `disabled` or `anthropic`** here. The stack
  runs with `NODE_ENV=production`, and the mock provider — which fabricates
  output — is rejected outright in production by the environment schema.

---

## The nginx proxy

`frontend/nginx.conf` is not boilerplate. Three things in it are load-bearing,
and each one silently breaks authentication if changed:

1. `proxy_set_header Host $http_host` — not `$host` (which drops the port),
   and not nginx's default (which rewrites it to the upstream name). The
   backend compares the browser's `Origin` against its own `Host`.
2. `proxy_pass http://backend:3000;` with no URI part and no `rewrite`. The
   refresh cookie is scoped to `path=/api/v1/auth` and the browser matches
   that against the URL *it* sees.
3. `try_files $uri $uri/ /index.html` for the SPA's client-side routes, with
   `index.html` served `no-store` so a stale copy cannot pin a browser to a
   fingerprinted asset that no longer exists.

The same three traps are documented in `frontend/vite.config.ts` for the dev
proxy. If you change one, change both.

The config also sends `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options` and a Content-Security-Policy that allows no inline script.

---

## Images

Both are multi-stage, and neither runtime image contains a compiler, a test
suite or a dev dependency.

**Backend** — `deps` → `build` → `prod-deps` → `runtime`, plus a separate
`migrator` target.

- Debian slim, not Alpine: Prisma ships a different query engine for musl and
  the Alpine variant is the one that fails at runtime with a missing-engine
  error that does not reproduce locally.
- `prisma generate` runs in the build stage; the generated client and its
  engine are copied into the runtime stage on top of a production-only
  dependency tree. The Prisma CLI is a dev dependency and is deliberately not
  shipped at runtime.
- Runs as the image's `node` user, which owns none of the application files —
  so the process cannot rewrite its own code.
- `CMD ["node", "dist/main"]` in exec form, so the process is PID 1 and
  receives `SIGTERM`. That is what Nest's `enableShutdownHooks()` needs to
  close the Prisma pool cleanly; going through `npm start` would put npm at
  PID 1 and swallow the signal.
- Its health check calls the application's real `/api/v1/health`, which pings
  the database — so an API that is up but cannot reach Postgres reports
  unhealthy rather than ready.

**Frontend** — `build` (Node) → `runtime` (nginx).

- `npm run build` runs `tsc --noEmit && vite build`, so a type error fails the
  image build. The image must not become a way around a gate CI enforces.
- There is no build argument for an API base URL. The client calls a
  hardcoded relative `/api/v1`; an absolute origin would reintroduce every
  cross-origin failure described above.

### Known gap

`nginx:1.27-alpine` runs its master process as root and its workers as
`nginx`, which is the stock posture. `nginxinc/nginx-unprivileged` would run
everything unprivileged and is the better choice, but it could not be pulled
and tested here, so the boring, certain base image was used instead. Switching
is a one-line change plus moving the listener from 80 to 8080.

---

## If the first build fails

Since none of this has been executed, these are the places to look first:

- **`npm ci` in a build stage.** The lockfiles are committed and the stages
  copy `package.json` + `package-lock.json` before the sources, so this
  should be clean — but a private registry or a proxy in your environment
  will surface here.
- **`prisma generate`.** Needs no database, but does download an engine on
  first run. A restricted network will fail here.
- **The runtime stage's Prisma client.** If the API starts and then fails
  with a missing query engine, the
  `COPY --from=build /app/node_modules/.prisma` line is the thing to check.
- **`argon2`.** It ships prebuilt N-API binaries for `linux-x64` and
  `linux-arm64` in both glibc and musl flavours, so it should not compile. If
  it tries to, `build-essential` and `python3` belong in the `deps` and
  `prod-deps` stages — never in the runtime one.
- **A 403 on refresh or logout after signing in.** That is the
  `proxy_set_header Host` line. See the proxy section above.
- **`nginx -t`.** The config was never run through nginx. If the container
  will not start, `docker compose run --rm --entrypoint nginx frontend -t`
  will say why.

---

## What this stack is not

It is a production-*shaped* local run, not a production deployment. It does
not terminate TLS, has no secret manager, no log aggregation, no backups, and
runs a single replica of everything. The auth throttle and the AI concurrency
cap are both per-process, so more than one API replica would multiply both
limits.

See `docs/deployment.md` for what a real deployment additionally requires.
