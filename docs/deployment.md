# Deploying OpsNow

> **Status: OpsNow is NOT deployed anywhere.**
>
> There is no hosting account, no managed database, no container registry, no
> domain and no credential for this project. Nothing in this repository has
> ever run outside a developer's machine.
>
> What exists is everything that can be built and verified without a target:
> production images, a Compose stack, a CI pipeline, environment validation
> that refuses to boot on a bad configuration, and this document. What remains
> is listed under [External steps](#external-steps-nobody-can-do-from-this-repository)
> and is entirely made of things that need an account and a card.

See `DECISIONS.md` ADR-027 for why the posture below was chosen.

---

## The shape of a deployment

```
                    HTTPS
  browser  ───────────────────────►  reverse proxy / CDN
                                      (TLS terminates here)
                                            │
                              ┌─────────────┴─────────────┐
                              │                           │
                        static SPA files            /api/*  ──►  OpsNow API
                        (nginx, from the                          (Node, from the
                         frontend image)                           backend image)
                                                                        │
                                                                  managed Postgres
```

One origin. The browser sees `https://opsnow.example.com` for both the
application and `https://opsnow.example.com/api/v1/...`.

### Same-origin is a requirement, not a preference

This is the single most important thing on this page. Three independent
mechanisms in the codebase assume the API is same-origin:

1. The refresh cookie is `SameSite=Strict` and scoped to
   `path=/api/v1/auth`. A browser on a different origin never sends it.
2. `POST /auth/refresh` and `POST /auth/logout` call
   `assertTrustedOrigin()`, which rejects any request whose `Origin` host
   differs from its own `Host`.
3. The frontend calls a hardcoded relative `/api/v1` and deliberately has no
   base-URL override.

Serving the API on `api.example.com` and the app on `app.example.com` will
not work, and **CORS will not fix it** — CORS does not make a
`SameSite=Strict` cookie travel. A split-origin deployment is a design
change, not a configuration.

That is also why production CORS is **disabled**, deliberately. Given the
above there is no legitimate cross-origin browser caller, so there is no
origin to allow-list.

---

## Prerequisites

| Requirement | Why |
| --- | --- |
| PostgreSQL 16 | The schema and the raw-SQL analytics queries target it. |
| Node 24 runtime, or the container images | What the project is built and CI-tested on. |
| TLS termination | The refresh cookie is `Secure` in production; a browser will not send a `Secure` cookie over plain http, so **sessions silently die on reload without HTTPS**. |
| A reverse proxy that can serve the SPA and pass `/api` through | See the origin model above. |
| Somewhere to hold secrets | `JWT_ACCESS_SECRET` and the database password must not live in a file in the repository. |

---

## Configuration

Every value is an environment variable. There is no configuration file, no
per-environment build, and nothing environment-specific compiled into either
image.

### Required — the application refuses to start without these

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Must be a `postgresql://` or `postgres://` URL; Joi rejects anything else. Percent-encode `@ : / ? # %` in the password. |
| `JWT_ACCESS_SECRET` | At least 32 characters, refused otherwise. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Rotating it invalidates every access token in flight; refresh tokens are database rows and survive, so users recover on their next refresh rather than being signed out. |

### Set these deliberately in production

| Variable | Production value | Why it matters |
| --- | --- | --- |
| `NODE_ENV` | `production` | Marks the refresh cookie `Secure`, drops `debug`/`verbose` logging, and makes the environment schema reject the AI mock provider outright. |
| `TRUST_PROXY_HOPS` | the real number of proxies in front of the process | **The setting most likely to be wrong, and wrong in either direction is a security problem.** See below. |
| `SWAGGER_ENABLED` | leave unset | Unset means OFF in production. Setting it publishes an unauthenticated, complete description of the API at `/api/docs`. |
| `AUTH_THROTTLE_LIMIT` | `10`, raised only if many real users share one egress IP | There is no value that disables the throttle. |
| `AI_PROVIDER` / `AI_API_KEY` | unset unless you want the assistant | Setting a key means ticket text and knowledge-base excerpts are sent to a third party (ADR-023). `mock` is rejected in production. |

`backend/.env.example` documents every variable, including the ones with
sensible defaults (`PORT`, `JWT_ACCESS_EXPIRES_IN`,
`REFRESH_TOKEN_TTL_SECONDS`, `AUTH_THROTTLE_TTL_SECONDS`).

### `TRUST_PROXY_HOPS`, specifically

It decides what `req.ip` means. `req.ip` is what the auth throttle counts
against (ADR-026) and what every audit row records (ADR-025), so:

- **Too low** (the default `0`, behind a proxy): every request appears to
  come from the proxy. One attacker exhausts the login throttle for every
  legitimate user at once, and the audit log records the proxy for
  everything.
- **Too high**, or Express' boolean `true`: nginx/Express reaches past the
  addresses your infrastructure appended into the part of the header the
  *client* controls. An attacker then gets a fresh throttle bucket per forged
  header and writes an address of their choosing into the audit log.

Count the proxies the request actually passes through — a CDN in front of a
load balancer in front of nginx is `3`. Nothing in the application can detect
a wrong value.

### Secrets

Never in the repository, never in an image layer, never in a build argument
(they end up in image history), never in a log. Both `.dockerignore` files
exclude `.env`.

Supply them at runtime from whatever your platform offers — AWS Secrets
Manager, GCP Secret Manager, Fly.io secrets, Render environment groups,
Kubernetes Secrets. Prefer short-lived or platform-rotated credentials over
long-lived static ones where the platform supports it.

---

## Database migrations

```
npx prisma migrate deploy
```

That is the only command a deployment runs against the database.
`migrate deploy` applies pending migrations in order and fails on drift. It
never generates a migration, never resets, and never drops anything.

**Never run `prisma migrate dev`, `prisma db push` or `prisma migrate reset`
against a deployed database.** The first two can drop and recreate objects to
make the schema match, which is right on a laptop and catastrophic anywhere
else.

**Never run `prisma db seed` against a deployed database.** `seed.ts` calls
`resetData()`, which deletes every table before inserting the demo data.

### How to run it

Run migrations as a **separate step that completes before the new
application version starts**, not inside the application's start-up.
Migrations then run exactly once regardless of replica count, and a failed
migration fails as its own visible unit instead of looking like a
crash-looping API.

The Compose stack does this with a dedicated one-shot `migrate` service built
from the backend image's `migrator` target
(`docker compose run --rm migrate`). On a platform with a release-phase or
pre-deploy hook, use that. The same image target works either way.

### Rollback

There is no down-migration. Prisma does not generate them and this project
has not written any. Rolling back a schema change means writing a new forward
migration that reverses it, which is the safer discipline anyway — but it
does mean **the database cannot be rolled back as fast as the application
can**. Deploy schema changes that are backwards-compatible with the currently
running version (add a nullable column, deploy code, backfill, then tighten
in a later release) so an application rollback never lands on a schema it
cannot read.

Take a backup before any migration that drops or rewrites a column. Nothing
in this repository does that for you.

---

## Build and start

### From source

```bash
# backend
cd backend
npm ci --omit=dev          # plus `npx prisma generate` with the CLI available
npm run build
npm run start:prod         # node dist/main

# frontend
cd frontend
npm ci
npm run build              # emits dist/, static files for any web server
```

### From the container images

`docker-compose.yml` builds and wires all of it; see `docs/docker.md`. The
backend image has three usable targets: `runtime` (the API), `migrator`
(`prisma migrate deploy`), and the intermediate build stages.

Run the API as a non-root user with a read-only filesystem if your platform
supports it — the image already runs as `node` and writes nothing outside
`/tmp`.

Signals matter: the image's `CMD` is exec-form `node dist/main`, so the
process is PID 1 and receives `SIGTERM`. That is what Nest's
`enableShutdownHooks()` needs in order to close the Prisma connection pool
cleanly. If you wrap the start command, keep exec form.

---

## Health checks

| Endpoint | Use | Checks |
| --- | --- | --- |
| `GET /api/v1/health` | **readiness** — should the load balancer send traffic here? | Pings the database. |
| `GET /api/v1/health/live` | **liveness** — is the process alive? | Nothing external. |

Both are unauthenticated.

Point the liveness probe at `/health/live` and **not** at `/health`. An
orchestrator restarts a container that fails liveness, so a liveness probe
that pings the database turns a brief Postgres blip into a rolling restart of
every instance, at exactly the moment the database is least able to absorb a
reconnect storm.

Allow a generous start period. The API connects to Postgres during boot.

---

## Logging

Nest's logger writes to stdout. In production, `debug` and `verbose` are
dropped (ADR-027); `error`, `warn` and `log` remain.

What is already true and worth knowing:

- No prompt, completion or AI key is ever logged (ADR-023).
- The audit log redacts secrets structurally, in three layers (ADR-025).
- An unhandled error logs its stack server-side and returns a generic
  `Internal server error` to the client.
- A failed login logs the sanitised identifier, never the password.

What is **not** done: logs are plain text, not JSON, so a log aggregator will
need a parser or a format change. There is no request id, no correlation id
and no log shipping. There is no error-reporting service on either side; the
frontend's error boundary logs to the browser console only.

---

## Security checklist before going live

- [ ] HTTPS everywhere, with HTTP redirected. Without it the `Secure` refresh
      cookie is never sent back and every session dies on reload.
- [ ] `NODE_ENV=production`.
- [ ] `TRUST_PROXY_HOPS` set to the real hop count.
- [ ] `JWT_ACCESS_SECRET` freshly generated for this environment, from a
      secret manager, never shared with any other environment.
- [ ] Database password freshly generated; the database not reachable from
      the public internet.
- [ ] `SWAGGER_ENABLED` unset (or `false`).
- [ ] The API not published on its own hostname or port — reachable only
      through the same-origin proxy path.
- [ ] Security response headers present on both app and API responses.
      `frontend/nginx.conf` sets `X-Content-Type-Options`, `Referrer-Policy`,
      `X-Frame-Options` and a CSP; **if you replace that proxy, you must
      replicate them** — the application does not send them itself
      (ADR-027, decision 7).
- [ ] `npm audit --omit=dev --audit-level=high` clean on both packages (CI
      runs this).
- [ ] Database backups configured and a restore actually tested.
- [ ] The seed script is not wired into any deployment step.

---

## External steps nobody can do from this repository

Each of these needs an account, a credential or a card. They are listed in
the order they have to happen.

1. **Choose a platform.** The images are ordinary containers, so anything
   that runs one works: Fly.io, Render, Railway, an AWS ECS/Fargate service,
   a small VM running the Compose stack behind Caddy or nginx.
2. **Provision managed PostgreSQL 16** and get its connection URL. Restrict
   network access to the application.
3. **Create a container registry** (GHCR, ECR, Docker Hub) and a push
   credential.
4. **Register a domain and obtain a TLS certificate** (most platforms do the
   certificate automatically).
5. **Create the secrets** in the platform's secret store:
   `DATABASE_URL`, `JWT_ACCESS_SECRET`, and optionally `AI_API_KEY`.
6. **Configure the reverse proxy** so the SPA and `/api` share one origin,
   and note how many proxy hops that adds for `TRUST_PROXY_HOPS`.
7. **Run `prisma migrate deploy` once** against the new database as a
   release step, before the first application start.
8. **Create the first administrator.** The database starts empty and the
   seed script must not be used. `POST /api/v1/auth/register` creates an
   `Employee` — the role is not settable through the API — so the first
   administrator's role has to be promoted with a one-off SQL statement
   against the production database. This is a genuine gap and is recorded as
   such; a small `create-admin` CLI would be the right fix.
9. **Add the deployment job to CI.** Only once steps 1–5 exist. Until then,
   `.github/workflows/ci.yml` deliberately has no deploy job and no empty
   secret references — configuration that has never been executed is worse
   than an honest gap.
10. **Verify against the running deployment**: sign in, reload (proves the
    refresh cookie round-trips over HTTPS), create a ticket, check
    `/api/v1/health` and `/api/v1/health/live`, confirm `/api/docs` is
    **not** reachable, and confirm a wrong password answers 401 while the
    eleventh attempt in a minute answers 429.

Step 10 is what would let the "deployed" claim in `README.md` change. Until
someone has done it, it must not.
