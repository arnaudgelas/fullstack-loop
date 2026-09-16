# Build conventions (binding for every image in this repo)

Derived from the development loop documented in README.md. Every agent working in this repo follows these exactly so
the images compose into one stack.

## Layout and ownership

    openapi/openapi.yaml     the contract — single source of truth, DO NOT EDIT
    backend/                 Spring Boot provider          (owner: backend agent)
    frontend/                Angular consumer              (owner: frontend agent)
    tools/codegen/           lint + codegen toolchain      (owner: codegen agent)
    e2e/, ci/                Playwright/axe + PR gate      (owner: test agent)
    docker-compose.yml       root orchestration            (owner: lead — do not create or edit)
    .dockerignore            root                          (owner: lead — do not edit)
    DOCKER-CONVENTIONS.md    this file                     (owner: lead — do not edit)

Write ONLY inside the directory you own. Never edit a file outside it.

## Build context

Every image builds with the **repository root as context**, and the Dockerfile
inside the component directory:

    docker build -f backend/Dockerfile -t fullstack-loop-backend .

This is so every image can read `openapi/openapi.yaml`. Assume that path is
available in the build context. Copy narrowly (`COPY backend/pom.xml ...`), never
`COPY . .`, so layer caching stays useful.

## Image names

    fullstack-loop-backend   fullstack-loop-frontend   fullstack-loop-codegen   fullstack-loop-e2e   fullstack-loop-ci

## Runtime contract

| Concern        | Value                                                        |
|----------------|--------------------------------------------------------------|
| Backend port   | 8080 (in container)                                          |
| Frontend port  | 8080 (in container, nginx as non-root; host maps to 4200)    |
| Database       | MongoDB 8, service name `mongo`, port 27017, database `loop` |
| Mongo URI env  | `SPRING_DATA_MONGODB_URI` (default `mongodb://mongo:27017/loop`) |
| Backend base   | frontend proxies `/api/` to `http://backend:8080`            |
| Health         | backend `GET /actuator/health`; frontend `GET /healthz`      |

## Image requirements (all images)

1. Multi-stage. Final stage contains no build toolchain, no source, no caches.
2. Pinned base image tags — never `latest`.
3. Runs as a **non-root** user; declare `USER` before `CMD`/`ENTRYPOINT`.
4. Declare `EXPOSE` and a `HEALTHCHECK` for long-running services.
5. Use BuildKit cache mounts (`RUN --mount=type=cache,...`) for package managers
   so the fast local development loop stays fast.
6. `.dockerignore` at the root already excludes node_modules/target/dist/.git.

## Toolchain versions (pinned, do not drift)

    Java            21 (eclipse-temurin)
    Spring Boot     3.5.x
    Maven           3.9.x
    Node            22 (node:22-alpine / node:22-bookworm-slim)
    Angular         20.x
    nginx           1.27-alpine
    MongoDB         8.0
    openapi-gen     openapitools/openapi-generator-cli:v7.16.0
    Redocly CLI     @redocly/cli 2.x

## Code generation

Generated client/server code is **never committed**. It is produced inside the
build from `openapi/openapi.yaml`, in a dedicated Dockerfile stage using
`FROM openapitools/openapi-generator-cli:v7.16.0 AS codegen`. The `fullstack-loop-codegen`
image exists separately so developers can regenerate into their working tree
during the fast local loop.

## Verification bar

Your work is not done until `docker build` succeeds for every image you own and
you have exercised it (run the container, or run the tests it packages). Report
the exact commands you ran and their real output. Never report a build as
passing that you did not run.
