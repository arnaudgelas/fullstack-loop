# syntax=docker/dockerfile:1.7
#
# fullstack-loop-e2e -- Playwright + axe-core deployment acceptance for the Fullstack Loop stack.
#
# This is the LAST gate in the pipeline: browser acceptance and automated
# accessibility checks, run after packaging and deployment have already
# succeeded. It validates an ALREADY-DEPLOYED
# stack (docker compose, or a Helm install on Kind/K3d). It never starts the
# application itself, which is why the Playwright config has no `webServer`.
#
# Scope: three critical browser journeys (authenticated list, authenticated
# create, and the 401 state) plus two axe scans. The primary BDD feedback loop
# is Cucumber/slice/component tests, below full browser level -- this image is
# deployment/system-level confirmation only.
#
# QUALITY-GATES.md, "every gate runs in CI *and* fails the Docker image build
# where it can": the `verify` stage below runs Prettier --check, ESLint
# --max-warnings=0 on typescript-eslint strictTypeChecked, and tsc --noEmit on
# the frontend's strict tsconfig tier. The image cannot be built dirty.
#
# AUTH.md: every /api/** operation needs an RS256 bearer token. The suite MINTS
# one with the development private key, which is bind-mounted at run time and is
# never copied into this image (dev-keys/ is in .dockerignore and .gitignore).
#
# Run-to-completion image, not a service: no EXPOSE and no HEALTHCHECK by
# design (DOCKER-CONVENTIONS.md requires those for long-running services only).
#
# Build (repository root as context, per DOCKER-CONVENTIONS.md):
#   docker build -f e2e/Dockerfile -t fullstack-loop-e2e .
# Run against a deployed stack:
#   docker run --rm --network fullstack-loop_default \
#     -e BASE_URL=http://frontend:8080 \
#     -v "$PWD/dev-keys/jwt-dev-private.pem:/etc/loop/jwt-private.pem:ro" \
#     -v "$PWD/e2e/playwright-report:/e2e/playwright-report" fullstack-loop-e2e

# The Playwright base image tag and the @playwright/test version in
# e2e/package.json MUST be the same number (1.63.0). A mismatch is the classic
# failure mode here: the browsers baked into the image speak a different driver
# protocol than the client that launches them, and every test dies at startup.
# Bump both together, and re-run `npm install --package-lock-only`.
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
ARG RUNTIME_BASE=ubuntu:24.04

# apt versions are pinned (QUALITY-GATES.md / hadolint DL3008). They are the
# candidates in ubuntu:24.04 at the time of writing; a security update changes
# them and the build fails loudly, which is the intended trade-off -- an
# unpinned install is a silently different image every time it is rebuilt.
ARG APT_CA_CERTIFICATES=20260601~24.04.1
ARG APT_CURL=8.5.0-2ubuntu10.13
ARG APT_XZ_UTILS=5.6.1+really5.4.5-1ubuntu0.3

# ---------------------------------------------------------------------------
# Stage 0: this Dockerfile's own gate. QUALITY-GATES.md requires every gate to
# "fail the Docker image build where it can", so a Dockerfile that does not
# satisfy hadolint at its strictest usable level cannot be built at all.
# ---------------------------------------------------------------------------
FROM hadolint/hadolint:v2.14.0-alpine AS dockerfile-lint
COPY e2e/Dockerfile /lint/e2e.Dockerfile
RUN hadolint --failure-threshold style /lint/e2e.Dockerfile && touch /lint.stamp

# ---------------------------------------------------------------------------
# Stage 1: dependencies. npm and its cache live only in this stage.
# ---------------------------------------------------------------------------
FROM ${PLAYWRIGHT_IMAGE} AS deps

WORKDIR /e2e

# Copy narrowly so the dependency layer is only invalidated by a manifest change.
COPY e2e/package.json e2e/package-lock.json ./

# `npm ci` only, never `npm install` (QUALITY-GATES.md). BuildKit cache mount:
# the npm cache never lands in an image layer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 2: quality gates. Formatting, type-aware lint and the strict type
# check, all fatal. This stage produces nothing the runtime consumes; it exists
# so that `docker build` fails on a warning.
# ---------------------------------------------------------------------------
FROM deps AS verify

COPY e2e/.prettierrc.json e2e/.prettierignore e2e/eslint.config.js ./
COPY e2e/tsconfig.json e2e/playwright.config.ts ./
COPY e2e/tests ./tests

RUN npx prettier --check . \
    && npx eslint . --max-warnings=0 \
    && npx tsc --noEmit \
    && touch /verify.stamp

# ---------------------------------------------------------------------------
# Stage 3: browser bundle. Only `chromium` is configured as a Playwright
# project, so firefox and webkit (~1.5 GB) are dropped HERE, in the stage the
# runtime copies FROM. Deleting them in the final stage would not shrink the
# image at all -- the bytes would still ship in the inherited base layer.
# ---------------------------------------------------------------------------
FROM ${PLAYWRIGHT_IMAGE} AS browsers

RUN rm -rf /ms-playwright/firefox-* /ms-playwright/webkit-*

# ---------------------------------------------------------------------------
# Stage 4: Node 22. DOCKER-CONVENTIONS.md pins Node 22 for this repository, but
# the Playwright base image ships Node 24, so the runtime gets its own verified
# Node 22 tarball from nodejs.org rather than inheriting whatever the browser
# image happens to carry. Pinned by version AND sha256, per architecture.
# ---------------------------------------------------------------------------
FROM ${RUNTIME_BASE} AS node

ARG APT_CA_CERTIFICATES
ARG APT_CURL
ARG APT_XZ_UTILS
ARG NODE_VERSION=22.23.2
ARG NODE_SHA256_AMD64=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307
ARG NODE_SHA256_ARM64=fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8
ARG TARGETARCH

SHELL ["/bin/bash", "-Eeuo", "pipefail", "-c"]

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
         "ca-certificates=${APT_CA_CERTIFICATES}" \
         "curl=${APT_CURL}" \
         "xz-utils=${APT_XZ_UTILS}" \
    && case "${TARGETARCH}" in \
         amd64) arch=x64;   sha="${NODE_SHA256_AMD64}" ;; \
         arm64) arch=arm64; sha="${NODE_SHA256_ARM64}" ;; \
         *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && curl -fsSL -o /tmp/node.tar.xz \
         "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz" \
    && echo "${sha}  /tmp/node.tar.xz" | sha256sum -c - \
    && mkdir -p /opt/node \
    && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && rm -rf /opt/node/lib/node_modules/corepack /opt/node/share /opt/node/include

# ---------------------------------------------------------------------------
# Stage 5: runtime. A bare Ubuntu of the same release as the Playwright base
# (noble/24.04, so the copied glibc-linked chromium binaries match), plus the
# verified Node 22, the chromium bundle only, and the shared libraries chromium
# needs -- installed by Playwright's own `install-deps`, so the library list is
# pinned by the @playwright/test version rather than hand-maintained here.
# No npm cache, no apt lists, no repository sources beyond the test files.
# ---------------------------------------------------------------------------
FROM ${RUNTIME_BASE} AS runtime

ARG APT_CA_CERTIFICATES

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CI=1 \
    BASE_URL=http://frontend:8080 \
    LOOP_JWT_PRIVATE_KEY_PATH=/etc/loop/jwt-private.pem \
    NODE_ENV=test \
    PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SHELL ["/bin/bash", "-Eeuo", "pipefail", "-c"]

COPY --from=node /opt/node /opt/node
COPY --from=browsers /ms-playwright /ms-playwright

WORKDIR /e2e

COPY --from=deps /e2e/node_modules ./node_modules
COPY e2e/package.json e2e/package-lock.json ./
COPY e2e/playwright.config.ts e2e/tsconfig.json ./
COPY e2e/tests ./tests

# ca-certificates so an HTTPS BASE_URL works; the rest is chromium's shared
# library closure, resolved by the pinned Playwright version rather than
# hand-listed. Non-root user created in the same layer.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
         "ca-certificates=${APT_CA_CERTIFICATES}" \
    && npx playwright install-deps chromium \
    && rm -rf /var/log/apt /tmp/* \
    && useradd --create-home --uid 1001 --user-group pwuser \
    && mkdir -p /e2e/playwright-report /e2e/test-results \
    && chown -R pwuser:pwuser /e2e

# The verify stage produces no runtime artefact, so without a COPY from it
# BuildKit would prune the stage and the gates would never run. Copying its
# stamp file is what makes `docker build` actually execute them.
COPY --from=verify /verify.stamp /usr/share/loop/e2e-verified
COPY --from=dockerfile-lint /lint.stamp /usr/share/loop/e2e-dockerfile-linted

USER pwuser

# Default: run the whole suite and exit with its status. Overridable, e.g.
#   docker run --rm fullstack-loop-e2e npx playwright test --list
CMD ["npx", "playwright", "test"]
