# syntax=docker/dockerfile:1.7
#
# fullstack-loop-backend — Spring Boot provider for the Task API.
#
# Build from the REPOSITORY ROOT so that openapi/openapi.yaml is in context:
#
#     docker build -f backend/Dockerfile -t fullstack-loop-backend .
#
# Stages:
#   deps    resolve Maven dependencies from pom.xml alone (cached)
#   build   generate the Spring interface from the contract, compile, test, package
#   runtime eclipse-temurin JRE, non-root, extracted Boot layers

# The lint stage is copied into the final image so BuildKit cannot prune it.
FROM hadolint/hadolint:v2.14.0-alpine AS dockerfile-lint
COPY backend/Dockerfile /lint/backend.Dockerfile
RUN hadolint --failure-threshold style /lint/backend.Dockerfile && touch /lint.stamp

# ---------------------------------------------------------------------------
# Stage 1 — dependency resolution
#
# Only pom.xml is copied, so editing a source file does not invalidate the
# dependency download. The BuildKit cache mount keeps ~/.m2 warm across builds.
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jdk-jammy AS deps

WORKDIR /workspace

COPY backend/.mvn/ .mvn/
COPY backend/mvnw .
COPY backend/pom.xml .

RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    ./mvnw -B -ntp \
      org.apache.maven.plugins:maven-dependency-plugin:3.8.1:go-offline \
      dependency:resolve-plugins \
      -DexcludeArtifactIds=fullstack-loop-backend

# ---------------------------------------------------------------------------
# Stage 2 — generate, compile, test, package
#
# The contract is copied to /openapi/openapi.yaml, which is exactly what
# ${openapi.spec} resolves to when we pass it explicitly below (the pom's
# default, ../openapi/openapi.yaml, is the developer-machine layout).
#
# The build runs `verify`, so every quality gate that can run here does:
# enforcer, Spotless, Checkstyle, the unit and slice tests, PMD, CPD, SpotBugs
# and the dependency analysis. A broken gate fails the image, not just CI.
#
# Two are deliberately deferred to the host, and neither is a relaxation:
#   -DskipITs      failsafe never fires, so no Testcontainers / Cucumber / Pact
#                  test tries to reach a Docker daemon from inside a build that
#                  has none. They run on the host with `./mvnw verify`.
#   -Djacoco.skip  the coverage thresholds are set against the FULL suite. With
#                  the integration rings skipped the ratio is not comparable, so
#                  checking it here would mean either a false failure or a
#                  meaninglessly low bar. It is enforced by `./mvnw verify`.
# ---------------------------------------------------------------------------
FROM deps AS build

COPY openapi/openapi.yaml /openapi/openapi.yaml
COPY backend/config/ config/
COPY backend/src/ src/

RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    ./mvnw -B -ntp verify -DskipITs -Djacoco.skip=true -Dopenapi.spec=/openapi/openapi.yaml

# Spring Boot 3.5 ships the `tools` jarmode (the old `layertools` is gone).
# `extract --launcher --layers` writes one directory per layer — dependencies,
# spring-boot-loader, snapshot-dependencies, application — straight under the
# destination, so the runtime image gets stable, separately cacheable layers.
# Flag order matters: --layers takes an optional value list, so it must come
# last or it swallows --launcher as a layer name. Verified by running
# `list-layers` and the extraction itself in this stage.
RUN cp target/fullstack-loop-backend-*.jar app.jar \
 && java -Djarmode=tools -jar app.jar list-layers \
 && java -Djarmode=tools -jar app.jar extract --launcher --destination /layers --layers \
 && ls -1 /layers

# ---------------------------------------------------------------------------
# Stage 3 — runtime
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

# No extra packages: the HEALTHCHECK uses busybox wget, already in the base image.
RUN addgroup -S -g 10001 loop \
 && adduser -S -u 10001 -G loop loop

WORKDIR /app

# One COPY per layer, ordered least- to most-frequently changing.
COPY --from=build --chown=loop:loop /layers/dependencies/ ./
COPY --from=build --chown=loop:loop /layers/spring-boot-loader/ ./
COPY --from=build --chown=loop:loop /layers/snapshot-dependencies/ ./
COPY --from=build --chown=loop:loop /layers/application/ ./
COPY --from=dockerfile-lint /lint.stamp /usr/share/loop/backend-dockerfile-linted

ENV SPRING_DATA_MONGODB_URI=mongodb://mongo:27017/loop \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0"

USER loop:loop

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=5 \
  CMD wget -q -O - http://localhost:8080/actuator/health || exit 1

# The extracted layers include the Spring Boot launcher, so start through it
# rather than re-packing a fat jar.
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
