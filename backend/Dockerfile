# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# OpsNow backend — production image (Phase 14)
#
# Debian slim rather than Alpine on purpose: Prisma ships a different query
# engine for musl, and the Alpine variant is the one that most often fails at
# runtime with a missing-engine error that does not reproduce on a developer's
# machine. The image is larger; the failure mode is worse.
#
# No compiler toolchain is installed, and none is needed. The only native
# dependency is argon2, which ships prebuilt N-API binaries (checked: it
# carries linux-x64 and linux-arm64, each in glibc and musl flavours) and
# resolves one through node-gyp-build at install time. If a future dependency
# does need to compile, that is a deliberate decision to add build-essential
# and python3 to the `deps` and `prod-deps` stages — never to the runtime one.
#
# Node 24 matches the version the project is developed and CI-tested on.
# ---------------------------------------------------------------------------
ARG NODE_VERSION=24-bookworm-slim

# --- deps -------------------------------------------------------------------
# Full dependency tree, including devDependencies, for the build and for the
# migrator (the Prisma CLI is a devDependency).
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` and not `npm install`: the lockfile is the contract, and a build
# that can silently resolve a different tree is not reproducible.
RUN npm ci

# --- build ------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
# Generate before compiling: the Nest build imports types from the generated
# client. This needs no database connection.
RUN npx prisma generate
RUN npm run build

# --- prod-deps --------------------------------------------------------------
# A clean runtime dependency tree, then the generated Prisma client copied in
# on top. Re-running `prisma generate` here is not possible — the CLI is a
# devDependency and is deliberately not shipped in the runtime image.
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- migrator ---------------------------------------------------------------
# A separate image whose only job is `prisma migrate deploy`. Compose runs it
# to completion before the API starts (see docker-compose.yml).
#
# `migrate deploy` and nothing else: it applies pending migrations in order and
# fails on drift. It never generates a migration, never resets, and never
# drops anything — unlike `migrate dev` and `db push`, neither of which may be
# pointed at a database that holds real data.
FROM node:${NODE_VERSION} AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# --- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
# The generated client and its query engine binary, from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY package.json ./

# The `node` user ships with the image; it owns nothing here, which is the
# point — the application cannot rewrite its own code at runtime.
USER node

EXPOSE 3000

# Uses the application's real health endpoint, which pings the database, so an
# API that is up but cannot reach Postgres reports unhealthy rather than ready.
# Written with node's own fetch because curl is not installed, and installing
# it only for a health check would widen the image's attack surface.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# `node dist/main` directly, in exec form, so the process is PID 1 and
# receives SIGTERM — which is what Nest's enableShutdownHooks() needs in order
# to close the Prisma connection pool cleanly. Going through `npm start` would
# put npm at PID 1 and swallow the signal.
CMD ["node", "dist/main"]
