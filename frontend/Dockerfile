# syntax=docker/dockerfile:1.7
#
# fullstack-loop-frontend — Angular 20 consumer of the Fullstack Loop Task API.
#
# Build from the REPOSITORY ROOT so that openapi/openapi.yaml is in context:
#     docker build -f frontend/Dockerfile -t fullstack-loop-frontend .
#
# Stages: codegen -> deps -> build -> runtime (nginx, non-root, port 8080).

# The lint stage is copied into the final image so BuildKit cannot prune it.
FROM hadolint/hadolint:v2.14.0-alpine AS dockerfile-lint
COPY frontend/Dockerfile /lint/frontend.Dockerfile
RUN hadolint --failure-threshold style /lint/frontend.Dockerfile && touch /lint.stamp

# ---------------------------------------------------------------------------
# codegen — the typed Angular client is GENERATED from the contract, never
# hand-written and never committed. Same generator, same flags as
# `npm run generate:api`.
# ---------------------------------------------------------------------------
FROM openapitools/openapi-generator-cli:v7.16.0 AS codegen

COPY openapi/openapi.yaml /contract/openapi.yaml

RUN docker-entrypoint.sh generate \
      -i /contract/openapi.yaml \
      -g typescript-angular \
      -o /generated \
      --strict-spec=true \
      --additional-properties=ngVersion=20.0.0,providedInRoot=true,fileNaming=kebab-case,withInterfaces=true,useSingleRequestParameter=false

# ---------------------------------------------------------------------------
# deps — `npm ci` from the lockfile only (QUALITY-GATES.md: never `npm install`
# in an image), so this layer is reused whenever the sources change but the
# dependencies do not.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV CI=true

COPY frontend/package.json frontend/package-lock.json ./

# procps: Stryker's process pool shells out to `ps` to reap its test runners,
# and node:22-bookworm-slim does not ship it. Version pinned (hadolint DL3008).
# Single RUN because hadolint DL3059 forbids consecutive RUN instructions.
RUN --mount=type=cache,target=/root/.npm \
    apt-get update \
 && apt-get install -y --no-install-recommends procps=2:4.0.2-3 \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# build — every gate QUALITY-GATES.md lists for the frontend, in the development loop's
# order, each one fatal. A red test, a lint warning, a formatting drift, a
# coverage miss, a surviving mutant or a build warning all fail the image.
#
# The PACT CONSUMER ring is deliberately NOT run here: it starts the native
# pact mock server and its real product is frontend/pacts/ on the host, for the
# provider to verify. Run it with `npm run test:pact` (the CI gate does).
# ---------------------------------------------------------------------------
FROM deps AS build

WORKDIR /app
ENV CI=true

COPY frontend/angular.json frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.spec.json ./
COPY frontend/eslint.config.js ./
COPY frontend/vitest.config.ts frontend/vitest.unit.config.ts frontend/vitest.component.config.ts ./
COPY frontend/vitest.pact.config.ts frontend/vitest.shared.ts frontend/vitest.rings.ts ./
COPY frontend/stryker.config.mjs frontend/proxy.conf.json ./
COPY frontend/.prettierrc.json frontend/.prettierignore ./
COPY frontend/scripts ./scripts
COPY frontend/src ./src
COPY frontend/test ./test

# The generated client lands inside the source tree, where the app imports it.
COPY --from=codegen /generated ./src/app/api/generated

# One RUN, because hadolint's DL3059 forbids consecutive RUN instructions. The
# `verify` script chains the gates with && in the documented gate order, so it still
# stops at the first failure and the failing gate is named in the log:
#   format:check -> lint -> typecheck -> test:unit -> test:component
#   -> test (aggregate, whole-codebase coverage) -> test:mutation -> build
RUN npm run verify

# ---------------------------------------------------------------------------
# runtime — nginx-unprivileged already runs as uid 101 (nginx) and keeps its
# pid/temp paths under /tmp, so no root is involved at any point.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="fullstack-loop-frontend" \
      org.opencontainers.image.description="Angular consumer of the Fullstack Loop Task API" \
      org.opencontainers.image.source="https://example.com/fullstack-loop"

# Rendered to /etc/nginx/conf.d/default.conf by the base image entrypoint.
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/browser /usr/share/nginx/html
COPY --from=dockerfile-lint /lint.stamp /usr/share/loop/frontend-dockerfile-linted

# NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes 15-local-resolvers.envsh export
# NGINX_LOCAL_RESOLVERS from /etc/resolv.conf, so the /api/ upstream is
# resolved per request instead of once at config load.
#
# FULLSTACK_LOOP_FRONTEND_TOKEN is EMPTY here on purpose: AUTH.md requires the token to
# be supplied at runtime and never baked into the image or the bundle. With no
# token the app loads, calls the API unauthenticated and renders its 401 state.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    BACKEND_ORIGIN=http://backend:8080 \
    FULLSTACK_LOOP_API_BASE_PATH="" \
    FULLSTACK_LOOP_FRONTEND_TOKEN=""

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1"]

CMD ["nginx", "-g", "daemon off;"]
