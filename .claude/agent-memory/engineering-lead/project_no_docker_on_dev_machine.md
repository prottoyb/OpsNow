---
name: no-docker-on-dev-machine
description: As of 2026-09-22 this machine has no Docker at all, so container work can be written but never built locally — plan CI as the first real build and label the gap.
metadata:
  type: project
---

The OpsNow development machine had **no Docker** as of 2026-09-22: `docker`
was not on `PATH` under either Bash or PowerShell, and Docker Desktop was not
installed (`C:\Program Files\Docker\...` absent). Phase 14's images and
Compose stack were therefore written and statically checked but **never
built**, and the same is true of `nginx.conf`, which was never run through
`nginx -t`.

**Why:** it changes what "done" can honestly mean for a containerisation
phase, and it changes where the first real verification happens. The CI
`docker` job was written specifically so that GitHub Actions becomes the
first place the images are built and the nginx config is syntax-checked —
that job is load-bearing here in a way it would not be on a machine with
Docker.

**How to apply:** before planning any container or Compose work in this
project, re-check whether Docker has since been installed
(`Get-Command docker`, and the Docker Desktop paths) rather than assuming
either state — this is exactly the kind of memory that goes stale. If it is
still absent:

- Do not mark "verify complete local environment" or any equivalent task
  complete. It stayed unchecked in Phase 14 for this reason.
- Substitute what IS possible and say so explicitly: parse the Compose file
  with a YAML parser (`js-yaml` is available inside `frontend/node_modules`),
  inspect the service graph, check native dependencies ship prebuilt binaries
  so no compiler is needed in the image, build both production bundles, and
  boot the compiled backend with `NODE_ENV=production` and probe it.
- Label the gap in every place a reader could be misled — the commit message,
  TASKS.md, progress.md, README.md and the doc for the thing itself. The
  project owner's standing expectation is that unverified work is marked
  unverified rather than quietly presented as done.

That production boot is worth doing on its own merits: it is what revealed
that Swagger was answering 200 at `/api/docs` under `NODE_ENV=production`,
which nothing in the test suite covered.

Related: [[non-destructive-test-data]], [[shared-dev-db-contention]]
