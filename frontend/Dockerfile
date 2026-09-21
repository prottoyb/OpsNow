# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# OpsNow frontend — production image (Phase 14)
#
# Builds the Vite bundle, then serves it from nginx, which also proxies /api
# to the backend. That proxy is not a convenience: OpsNow's refresh cookie is
# SameSite=Strict and path-scoped, the backend enables no CORS and rejects a
# cross-origin refresh outright, so the API must appear same-origin to the
# browser or authentication does not work at all. See nginx.conf, which
# carries the specific traps.
#
# There is deliberately no build argument for an API base URL: the client
# calls a hardcoded relative `/api/v1` (src/lib/api/client.ts), and pointing
# it at an absolute origin would reintroduce exactly the failures above.
# ---------------------------------------------------------------------------
ARG NODE_VERSION=24-bookworm-slim
ARG NGINX_VERSION=1.27-alpine

# --- build ------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# The whole context rather than a hand-picked list of files: `npm run build`
# runs `tsc --noEmit` first, which reads tsconfig.json's `include`, and a
# missing entry there would type-check a quietly different set of files from
# the one CI checks. `.dockerignore` is what decides the exclusions, in one
# place, where they are visible.
COPY . .

# A type error therefore fails the image build rather than shipping. That is
# intentional: the image must not become a way to route around a gate CI
# enforces. (Test files are excluded by .dockerignore, so this checks the
# application sources, not the suites.)
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM nginx:${NGINX_VERSION} AS runtime

# Replace the stock server block rather than adding to it, so the default
# "welcome" site cannot answer for anything.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/opsnow.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# BusyBox wget, already present in the alpine image. Hitting `/` rather than a
# dedicated endpoint is correct here: this container's job is to serve the
# application shell, and it can do that whether or not the API is reachable.
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1/ || exit 1

# The stock image's own entrypoint and CMD are correct (it renders templates,
# then runs nginx in the foreground), so they are left alone.
