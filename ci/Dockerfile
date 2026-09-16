# syntax=docker/dockerfile:1.7
#
# fullstack-loop-ci -- the fast pull-request validation gate as a single
# reproducible toolbox image.
#
# Everything the PR gate needs, pinned to one set of versions so a developer's
# laptop and the CI runner execute the identical toolchain:
#   Java 21 (Temurin) . Maven 3.9.x . Node 22 . docker CLI + compose plugin
#   . git . curl . bash
#
# The docker CLI is here so the Testcontainers-based integration tests and any
# compose-based step work, by talking to the HOST daemon through a mounted
# socket. This image contains no daemon and starts nothing.
#
# Build (repository root as context, per DOCKER-CONVENTIONS.md):
#   docker build -f ci/Dockerfile -t fullstack-loop-ci .
#
# Run the PR gate over a checkout:
#   docker run --rm \
#     -v "$PWD:/workspace" \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     --group-add "$(stat -c '%g' /var/run/docker.sock)" \
#     fullstack-loop-ci
#
# NON-ROOT AND THE DOCKER SOCKET -- read this, it is the one real caveat.
# The image runs as uid 1001 (`ci`), never root. A mounted /var/run/docker.sock
# is owned by a group id that comes from the HOST and differs per machine
# (typically 999 on Linux, and on Docker Desktop for macOS the socket inside the
# VM is commonly group 0). uid 1001 therefore cannot open the socket unless the
# caller grants access at run time. Two honest options:
#   1. `--group-add <gid-of-host-socket>` as shown above (preferred), or
#   2. `--user root` for that specific invocation, accepting the trade-off.
# There is no way to bake the right gid into the image, because it is not known
# at build time. This image does NOT silently run as root to paper over it, and
# ci/pr-validation.sh detects an unreachable daemon and reports the Docker-
# dependent steps as an explicit SKIP rather than a pass.

# ---- pinned versions (DOCKER-CONVENTIONS.md "do not drift") ----------------
# Node 22's version and checksums are NOT an ARG here: they live in
# versions/node.env, the single source of truth shared with e2e/Dockerfile's
# own independent Node 22 download (see the toolchain stage below).
ARG JDK_IMAGE=eclipse-temurin:21-jdk-noble
ARG BUILDER_IMAGE=ubuntu:24.04
ARG MAVEN_VERSION=3.9.11
ARG MAVEN_SHA512=bcfe4fe305c962ace56ac7b5fc7a08b87d5abd8b7e89027ab251069faebee516b0ded8961445d6d91ec1985dfe30f8153268843c89aa392733d1a3ec956c9978
ARG DOCKER_VERSION=29.8.1
ARG COMPOSE_VERSION=2.40.3
ARG ACTIONLINT_VERSION=1.7.12

# apt versions are pinned (QUALITY-GATES.md / hadolint DL3008). These are the
# candidates in ubuntu:24.04 and eclipse-temurin:21-jdk-noble (both noble) at
# the time of writing. A security update changes them and the build fails
# loudly -- the intended trade-off: an unpinned install is a silently different
# image on every rebuild.
ARG APT_BASH=5.2.21-2ubuntu4
ARG APT_CA_CERTIFICATES=20260601~24.04.1
ARG APT_CURL=8.5.0-2ubuntu10.13
ARG APT_GIT=1:2.43.0-1ubuntu7.3
ARG APT_JQ=1.7.1-3ubuntu0.24.04.2
ARG APT_UNZIP=6.0-28ubuntu4.1
ARG APT_XZ_UTILS=5.6.1+really5.4.5-1ubuntu0.3

# ---------------------------------------------------------------------------
# Stage 0: the gates that guard this image itself. QUALITY-GATES.md requires
# every gate to "fail the Docker image build where it can", so a Dockerfile
# that does not satisfy hadolint at its strictest usable level, or a
# pr-validation.sh that is not shellcheck-clean, cannot be built at all.
# ---------------------------------------------------------------------------
FROM hadolint/hadolint:v2.14.0-alpine AS dockerfile-lint
COPY ci/Dockerfile /lint/ci.Dockerfile
RUN hadolint --failure-threshold style /lint/ci.Dockerfile && touch /lint.stamp

FROM koalaman/shellcheck-alpine:v0.11.0 AS script-lint
COPY ci/pr-validation.sh /lint/pr-validation.sh
COPY tools/codegen/codegen.sh /lint/codegen.sh
COPY scripts/gen-dev-keys.sh /lint/gen-dev-keys.sh
COPY scripts/mint-dev-token.sh /lint/mint-dev-token.sh
COPY frontend/scripts/ng-build-strict.sh /lint/ng-build-strict.sh
RUN shellcheck /lint/*.sh && touch /lint.stamp

# ---------------------------------------------------------------------------
# Stage 1: fetch and verify every third-party tarball. curl, tar and the
# checksums live only here; the final image inherits directories, not tooling.
# Every artifact is pinned by version AND by a checksum published upstream
# (or, for the docker static tarballs, which publish none, a checksum recorded
# when this file was written -- regenerate it deliberately on a version bump).
# ---------------------------------------------------------------------------
FROM ${BUILDER_IMAGE} AS toolchain

ARG MAVEN_VERSION
ARG MAVEN_SHA512
ARG DOCKER_VERSION
ARG COMPOSE_VERSION
ARG ACTIONLINT_VERSION
ARG TARGETARCH

ARG DOCKER_SHA256_AMD64=d8db66739d2e28d4933786d73e918d9be643a67fbd835db1bf740d650a259e70
ARG DOCKER_SHA256_ARM64=667395fbffab52901b80181dfbb39ea76da2fbd7642c4fbddd24e42146b07b48
ARG COMPOSE_SHA256_AMD64=dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372
ARG COMPOSE_SHA256_ARM64=d26373b19e89160546d15407516cc59f453030d9bc5b43ba7faf16f7b4980137
ARG ACTIONLINT_SHA256_AMD64=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
ARG ACTIONLINT_SHA256_ARM64=325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6
ARG APT_CA_CERTIFICATES
ARG APT_CURL
ARG APT_XZ_UTILS

# bash with -Eeuo pipefail for every RUN below: a failure anywhere in a pipe
# (a truncated download feeding sha256sum) must abort the build, not be masked
# by the exit status of the last command (hadolint DL4006).
SHELL ["/bin/bash", "-Eeuo", "pipefail", "-c"]

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
         "ca-certificates=${APT_CA_CERTIFICATES}" \
         "curl=${APT_CURL}" \
         "xz-utils=${APT_XZ_UTILS}"

# Apache Maven (architecture-independent).
RUN set -eux; \
    curl -fsSL -o /tmp/maven.tar.gz \
      "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz"; \
    echo "${MAVEN_SHA512}  /tmp/maven.tar.gz" | sha512sum -c -; \
    mkdir -p /opt/maven; \
    tar -xzf /tmp/maven.tar.gz -C /opt/maven --strip-components=1; \
    rm -f /tmp/maven.tar.gz

# Node 22 (official nodejs.org build, SHASUMS256-verified). Version and
# checksums come from versions/node.env, the single source of truth shared
# with e2e/Dockerfile's own independent Node 22 download.
COPY versions/node.env /tmp/node.env

RUN set -eux; \
    . /tmp/node.env; \
    case "${TARGETARCH}" in \
      amd64) arch=x64;   sha="${NODE_SHA256_AMD64}" ;; \
      arm64) arch=arm64; sha="${NODE_SHA256_ARM64}" ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/node.tar.xz \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz"; \
    echo "${sha}  /tmp/node.tar.xz" | sha256sum -c -; \
    mkdir -p /opt/node; \
    tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1; \
    rm -f /tmp/node.tar.xz /tmp/node.env; \
    rm -rf /opt/node/lib/node_modules/corepack /opt/node/share /opt/node/include

# docker CLI (static build; the daemon binaries in the tarball are discarded)
# and the compose v2 CLI plugin.
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) darch=x86_64;  carch=x86_64;  dsha="${DOCKER_SHA256_AMD64}"; csha="${COMPOSE_SHA256_AMD64}" ;; \
      arm64) darch=aarch64; carch=aarch64; dsha="${DOCKER_SHA256_ARM64}"; csha="${COMPOSE_SHA256_ARM64}" ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/docker.tgz \
      "https://download.docker.com/linux/static/stable/${darch}/docker-${DOCKER_VERSION}.tgz"; \
    echo "${dsha}  /tmp/docker.tgz" | sha256sum -c -; \
    mkdir -p /opt/docker/bin /opt/docker/cli-plugins; \
    tar -xzf /tmp/docker.tgz -C /tmp; \
    install -m 0755 /tmp/docker/docker /opt/docker/bin/docker; \
    rm -rf /tmp/docker /tmp/docker.tgz; \
    curl -fsSL -o /opt/docker/cli-plugins/docker-compose \
      "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-${carch}"; \
    echo "${csha}  /opt/docker/cli-plugins/docker-compose" | sha256sum -c -; \
    chmod 0755 /opt/docker/cli-plugins/docker-compose

# actionlint: GitHub workflow schema/expression validation. Its embedded shell
# snippets are also checked because the final image carries ShellCheck below.
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) arch=amd64; sha="${ACTIONLINT_SHA256_AMD64}" ;; \
      arm64) arch=arm64; sha="${ACTIONLINT_SHA256_ARM64}" ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/actionlint.tar.gz \
      "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_${arch}.tar.gz"; \
    echo "${sha}  /tmp/actionlint.tar.gz" | sha256sum -c -; \
    mkdir -p /opt/actionlint; \
    tar -xzf /tmp/actionlint.tar.gz -C /opt/actionlint actionlint; \
    chmod 0755 /opt/actionlint/actionlint; \
    rm -f /tmp/actionlint.tar.gz

# ---------------------------------------------------------------------------
# Stage 2: the toolbox itself. Temurin 21 JDK (a JDK, not a JRE -- the gate
# compiles and runs PIT/Stryker), plus the verified tools. No curl-download
# machinery, no tarballs, no apt lists.
# ---------------------------------------------------------------------------
FROM ${JDK_IMAGE} AS ci

ARG MAVEN_VERSION
ARG DOCKER_VERSION
ARG COMPOSE_VERSION
ARG ACTIONLINT_VERSION
ARG APT_BASH
ARG APT_CA_CERTIFICATES
ARG APT_CURL
ARG APT_GIT
ARG APT_JQ
ARG APT_UNZIP

SHELL ["/bin/bash", "-Eeuo", "pipefail", "-c"]

LABEL org.opencontainers.image.title="fullstack-loop-ci" \
      org.opencontainers.image.description="Fast Pull-Request Validation toolbox for the Fullstack Loop stack" \
      org.opencontainers.image.source="https://github.com/arnaudgelas/fullstack-loop"

# git/curl/bash for the gate itself; the rest arrives from the toolchain stage.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
         "bash=${APT_BASH}" \
         "ca-certificates=${APT_CA_CERTIFICATES}" \
         "curl=${APT_CURL}" \
         "git=${APT_GIT}" \
         "jq=${APT_JQ}" \
         "unzip=${APT_UNZIP}" \
    && rm -rf /var/log/apt

COPY --from=toolchain /opt/maven /opt/maven
COPY --from=toolchain /opt/node /opt/node
COPY --from=toolchain /opt/docker/bin/docker /usr/local/bin/docker
COPY --from=toolchain /opt/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=toolchain /opt/actionlint/actionlint /usr/local/bin/actionlint
COPY --from=script-lint /bin/shellcheck /usr/local/bin/shellcheck

ENV MAVEN_HOME=/opt/maven \
    NODE_HOME=/opt/node \
    PATH=/opt/maven/bin:/opt/node/bin:${JAVA_HOME}/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    MAVEN_OPTS="-Xmx2g" \
    NPM_CONFIG_CACHE=/home/ci/.npm \
    CI=1 \
    WORKSPACE=/workspace \
    STRICT=1

# Non-root. uid/gid 1001 is fixed so a caller can chown mounted caches to match.
# See the socket caveat in the header comment: grant docker access at run time
# with --group-add, never by baking a root USER in here.
RUN groupadd --gid 1001 ci \
    && useradd --create-home --uid 1001 --gid 1001 ci \
    && mkdir -p /workspace /home/ci/.m2 /home/ci/.npm \
    && chown -R ci:ci /workspace /home/ci

# Nothing runtime-visible comes out of the lint stages, so without these COPYs
# BuildKit would prune them and the gates would never run.
COPY --from=dockerfile-lint /lint.stamp /usr/share/loop/ci-dockerfile-linted
COPY --from=script-lint /lint.stamp /usr/share/loop/ci-script-linted

COPY --chown=ci:ci --chmod=0755 ci/pr-validation.sh /usr/local/bin/pr-validation.sh

# A toolbox that runs to completion, not a service: no EXPOSE, no HEALTHCHECK.
USER 1001:1001
WORKDIR /workspace

CMD ["/usr/local/bin/pr-validation.sh"]
