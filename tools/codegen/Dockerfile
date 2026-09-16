# syntax=docker/dockerfile:1.7
#
# fullstack-loop-codegen — developer toolchain for the contract stage of the development loop:
#     [OpenAPI Contract] -> [Redocly Strict Lint] -> [Code Generation]
#
# Build (repository root as context, per DOCKER-CONVENTIONS.md):
#     docker build -f tools/codegen/Dockerfile -t fullstack-loop-codegen .
#
# BASE CHOICE
# -----------
# Final stage is node:22-bookworm-slim with a Temurin 21 JRE copied in, rather
# than openapitools/openapi-generator-cli:v7.16.0 with Node bolted on. Reasons:
#   1. openapi-generator ships as a single self-contained fat jar and a JRE is a
#      relocatable directory — both are trivially COPY-able. Redocly is the
#      harder dependency: it needs a real Node runtime plus an npm install tree.
#   2. The official generator image is Ubuntu 20.04 on JDK 17, both older than
#      the versions this repo pins (Node 22, Java 21). Basing on it would drag a
#      stale distro and the wrong JDK into the toolchain.
# The generator jar itself is still taken from the pinned official image, so the
# generator bits are byte-identical to openapitools/openapi-generator-cli:v7.16.0.

# ------------------------------------------------------------------- gate: hadolint
# QUALITY-GATES.md: every gate runs in CI *and* fails the image build where it
# can. These two stages lint this Dockerfile and the entrypoint during the build
# itself, so a `docker build` cannot succeed with a lint-dirty toolchain. The
# runtime stage COPYs their stamp files, which is what forces BuildKit to
# actually execute them rather than prune them as unreachable.
FROM hadolint/hadolint:v2.14.0-alpine AS dockerfile-lint
COPY tools/codegen/Dockerfile /lint/Dockerfile
RUN hadolint --failure-threshold style /lint/Dockerfile \
 && echo "hadolint v2.14.0 --failure-threshold style: clean" > /lint/PASSED

# ----------------------------------------------------------------- gate: shellcheck
FROM koalaman/shellcheck-alpine:v0.11.0 AS shell-lint
COPY tools/codegen/codegen.sh /lint/codegen.sh
RUN shellcheck /lint/codegen.sh \
 && echo "shellcheck v0.11.0 default severity: clean" > /lint/PASSED

# ---------------------------------------------------------------- generator jar
FROM openapitools/openapi-generator-cli:v7.16.0 AS generator

# --------------------------------------------------------------------- java jre
# Jammy (glibc 2.35) deliberately: glibc is forward compatible, so this JRE runs
# on the bookworm (glibc 2.36) final stage. A noble-based JRE would not.
FROM eclipse-temurin:21.0.8_9-jre-jammy AS jre

# ----------------------------------------------------------------- redocly cli
FROM node:22.20.0-bookworm-slim AS redocly
ENV npm_config_update_notifier=false
WORKDIR /opt/redocly
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --no-audit --no-fund --omit=dev @redocly/cli@2.4.0

# ---------------------------------------------------------------------- runtime
FROM node:22.20.0-bookworm-slim AS runtime

ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:/opt/codegen/bin:$PATH \
    HOME=/tmp \
    npm_config_update_notifier=false \
    REDOCLY_TELEMETRY=off \
    REDOCLY_SUPPRESS_UPDATE_NOTICE=true

COPY --from=jre       /opt/java/openjdk /opt/java/openjdk
COPY --from=generator /opt/openapi-generator/modules/openapi-generator-cli/target/openapi-generator-cli.jar \
                      /opt/openapi-generator/openapi-generator-cli.jar
COPY --from=redocly   /opt/redocly /opt/redocly

# The strict ruleset and the entrypoint live in the image, not in the working
# tree, so a stray redocly.yaml in a checkout cannot weaken the lint gate.
COPY tools/codegen/redocly.yaml /opt/codegen/redocly.yaml
COPY tools/codegen/codegen.sh   /opt/codegen/bin/codegen

# Build-time proof that both lint gates ran and passed. Removing these two
# lines would let the image build with a lint-dirty Dockerfile or script.
COPY --from=dockerfile-lint /lint/PASSED /opt/codegen/gates/hadolint.passed
COPY --from=shell-lint      /lint/PASSED /opt/codegen/gates/shellcheck.passed

RUN set -eux; \
    ln -s /opt/redocly/node_modules/.bin/redocly /usr/local/bin/redocly; \
    chmod 0755 /opt/codegen/bin/codegen; \
    chmod 0444 /opt/codegen/redocly.yaml; \
    # Non-root by default. /workspace is a bind-mount point only; it is made
    # group/other writable so the image still works when the caller passes an
    # arbitrary -u uid:gid that matches no entry in /etc/passwd.
    useradd --uid 10001 --gid 0 --no-log-init --create-home --home-dir /home/codegen codegen; \
    chmod 0777 /home/codegen; \
    mkdir -p /workspace; \
    chmod 0777 /workspace; \
    java -version; \
    redocly --version; \
    java -jar /opt/openapi-generator/openapi-generator-cli.jar version

WORKDIR /workspace

# CLI image, not a service: no EXPOSE, no HEALTHCHECK. `--help` works.
USER 10001:0
ENTRYPOINT ["/opt/codegen/bin/codegen"]
CMD ["help"]
