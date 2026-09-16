#!/usr/bin/env bash
#
# Fast pull-request validation -- the gate every PR must pass.
#
#   Type checking . lint . unit . slice . Cucumber . Pact . relevant integration
#   then [Scoped Mutation Tests] (PIT + Stryker), incremental on PRs.
#
# It runs every gate QUALITY-GATES.md requires, ordered cheapest signal first
# -- contract, then lint and type checks, then unit, slice, acceptance, contract
# verification and integration, then mutation -- and stops at the first failure,
# so a broken type check never burns ten minutes of integration tests.
#
# STRICTNESS
#   STRICT=1 (the default, and what the image ships with) means a missing or
#   unrunnable step is a FAILURE, not a SKIP. There is no "the project does not
#   have that gate yet" any more: QUALITY-GATES.md requires the gate, so its
#   absence is the finding. STRICT=0 restores the permissive, skip-and-continue
#   behaviour, and exists ONLY for local use while something is half-written.
#
#   Nothing here is wrapped in `|| true`, no severity is downgraded, and no
#   tool is invoked with a flag that weakens it.
#
# Exit codes: 0 every gate passed, 1 a gate failed (or was unrunnable under
# STRICT), 2 bad usage/environment.
#
# Environment:
#   WORKSPACE       repo root to validate               (default /workspace)
#   HOST_WORKSPACE  the same checkout's path ON THE HOST, needed because the
#                   contract gates start sibling containers through the mounted
#                   docker socket (default: WORKSPACE, which is only correct
#                   when this script runs outside a container)
#   STRICT          1 = missing gate is a failure       (default 1)
#   RUN_MUTATION    run [Scoped Mutation Tests]         (default = STRICT)
#   MUTATION_SCOPE  "changed" (incremental, PRs) | "all" (periodic)
#   BASE_REF        git ref to diff against for scoping (default origin/main)
#   SKIP_STEPS      comma-separated step ids to skip deliberately; under
#                   STRICT this is refused, because a gate you can switch off
#                   from the environment is not a gate
set -Eeuo pipefail

WORKSPACE="${WORKSPACE:-/workspace}"
STRICT="${STRICT:-1}"
MUTATION_SCOPE="${MUTATION_SCOPE:-changed}"
BASE_REF="${BASE_REF:-origin/main}"
SKIP_STEPS="${SKIP_STEPS:-}"
RUN_MUTATION="${RUN_MUTATION:-${STRICT}}"

readonly BACKEND="${WORKSPACE}/backend"
readonly FRONTEND="${WORKSPACE}/frontend"
readonly CODEGEN_IMAGE="${CODEGEN_IMAGE:-fullstack-loop-codegen}"

# The contract gates start a sibling container on the HOST daemon through the
# mounted socket, so their -v source is resolved by the host, not by this
# container. "/workspace" almost never exists there. HOST_WORKSPACE is the path
# the repository lives at ON THE HOST; without it the codegen container would
# bind-mount a freshly created empty directory and lint nothing, which is the
# worst possible outcome -- a green gate that checked no files.
readonly HOST_WORKSPACE="${HOST_WORKSPACE:-${WORKSPACE}}"

# --batch-mode/--no-transfer-progress only quieten output; neither skips or
# downgrades anything. `-DskipTests` and friends appear nowhere in this file.
readonly MVN_FLAGS=(--batch-mode --no-transfer-progress)

# --- output -----------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
  C_RESET=''; C_BOLD=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''
fi
readonly C_RESET C_BOLD C_RED C_GREEN C_YELLOW C_BLUE

STEP_NO=0
FAILED=0
ALLOW_READONLY=0
SKIPPED=0
declare -a RESULTS=()
declare -A STEP_STATUS=()

banner() {
  printf '%s\n' "${C_BOLD}${C_BLUE}================================================================${C_RESET}"
  printf '%s\n' "${C_BOLD}${C_BLUE}  $*${C_RESET}"
  printf '%s\n' "${C_BOLD}${C_BLUE}================================================================${C_RESET}"
}

start_step() {
  STEP_NO=$((STEP_NO + 1))
  printf '\n%s\n' "${C_BOLD}--- STEP ${STEP_NO}: $2  [${1}] ---${C_RESET}"
}

pass_step() {
  STEP_STATUS["$1"]=PASS
  RESULTS+=("${C_GREEN}PASS${C_RESET}  $1  ($2)")
  printf '%s\n' "${C_GREEN}PASS${C_RESET}  $1 -- $2"
}

summary() {
  printf '\n'
  banner "Fast Pull-Request Validation -- summary"
  local line
  for line in "${RESULTS[@]}"; do printf '  %s\n' "${line}"; done
  printf '\n'
  if (( FAILED )); then
    printf '%s\n' "${C_RED}${C_BOLD}RESULT: FAILED${C_RESET}"
  elif (( SKIPPED > 0 )); then
    printf '%s\n' "${C_YELLOW}${C_BOLD}RESULT: PASSED WITH ${SKIPPED} SKIPPED STEP(S) -- STRICT=0, NOT A CI-VALID RUN${C_RESET}"
  else
    printf '%s\n' "${C_GREEN}${C_BOLD}RESULT: PASSED${C_RESET}"
  fi
}

fail_and_exit() {
  STEP_STATUS["$1"]=FAIL
  FAILED=1
  RESULTS+=("${C_RED}FAIL${C_RESET}  $1  ($2)")
  printf '\n%s\n' "${C_RED}${C_BOLD}FAIL  $1 -- $2${C_RESET}"
  summary
  exit 1
}

# The single place where "this gate cannot run" is decided.
#
# Under STRICT that is a failure and the run stops: QUALITY-GATES.md requires
# every gate, so a gate that is absent, unconfigured or unreachable is exactly
# the defect this script exists to surface. Under STRICT=0 it degrades to the
# old, deliberately unmissable SKIP for local use.
unrunnable() {
  local id="$1" reason="$2"
  if [[ "${STRICT}" == "1" ]]; then
    fail_and_exit "${id}" "REQUIRED GATE CANNOT RUN: ${reason}"
  fi
  STEP_STATUS["${id}"]=SKIP
  SKIPPED=$((SKIPPED + 1))
  RESULTS+=("${C_YELLOW}SKIP${C_RESET}  ${id}  (${reason})")
  printf '%s\n' "${C_YELLOW}>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>${C_RESET}"
  printf '%s\n' "${C_YELLOW}>>> SKIPPED: ${id}${C_RESET}"
  printf '%s\n' "${C_YELLOW}>>> reason:  ${reason}${C_RESET}"
  printf '%s\n' "${C_YELLOW}>>> This step did NOT run. It is not a pass.${C_RESET}"
  printf '%s\n' "${C_YELLOW}>>> It would be a FAILURE under STRICT=1 (the CI default).${C_RESET}"
  printf '%s\n' "${C_YELLOW}>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>${C_RESET}"
}

is_skipped_by_request() {
  [[ ",${SKIP_STEPS}," == *",$1,"* ]]
}

# run <step-id> <description> <working-dir> <command...>
run() {
  local id="$1" desc="$2" dir="$3"
  shift 3
  start_step "${id}" "${desc}"

  if is_skipped_by_request "${id}"; then
    unrunnable "${id}" "explicitly requested via SKIP_STEPS=${SKIP_STEPS}"
    return 0
  fi
  # A few gates genuinely write nothing into the checkout (the contract gates
  # lint in a sibling container and diff into a scratch dir of their own), so
  # they opt out of the writable-workspace requirement rather than being
  # skipped for a reason that does not apply to them.
  if (( ! WORKSPACE_WRITABLE )) && [[ "${ALLOW_READONLY}" != "1" ]]; then
    unrunnable "${id}" "${RO_REASON}"
    return 0
  fi

  printf '    dir: %s\n    cmd: %s\n\n' "${dir}" "$*"
  local started rc elapsed
  started=${SECONDS}
  if ( cd "${dir}" && "$@" ); then rc=0; else rc=$?; fi
  elapsed=$((SECONDS - started))
  if (( rc == 0 )); then
    pass_step "${id}" "${desc}, ${elapsed}s"
  else
    fail_and_exit "${id}" "${desc}, exit ${rc} after ${elapsed}s"
  fi
}

# --- capability probes ------------------------------------------------------
have_backend()  { [[ -f "${BACKEND}/pom.xml" ]]; }
have_frontend() { [[ -f "${FRONTEND}/package.json" ]]; }

frontend_has_script() {
  have_frontend || return 1
  node -e 'const s=require(process.argv[1]).scripts||{};process.exit(s[process.argv[2]]?0:1)' \
    "${FRONTEND}/package.json" "$1" 2>/dev/null
}

pom_contains() {
  have_backend || return 1
  grep -q "$1" "${BACKEND}/pom.xml"
}

backend_tests_contain() {
  [[ -d "${BACKEND}/src/test" ]] || return 1
  grep -rql "$1" "${BACKEND}/src/test" >/dev/null 2>&1
}

docker_available() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

codegen_image_available() {
  docker_available && docker image inspect "${CODEGEN_IMAGE}" >/dev/null 2>&1
}

# Every build step writes: Maven into backend/target, npm into node_modules. A
# read-only workspace is not a degraded run, it is a run in which nothing can
# execute -- so detect it once, up front, instead of emitting a pile of EROFS
# errors that look like real test failures.
WORKSPACE_WRITABLE=0
if touch "${WORKSPACE}/.pr-validation-write-probe" 2>/dev/null; then
  rm -f "${WORKSPACE}/.pr-validation-write-probe"
  WORKSPACE_WRITABLE=1
fi
readonly WORKSPACE_WRITABLE
readonly RO_REASON="workspace is mounted read-only -- Maven needs target/ and npm needs node_modules/; mount it writable"

# --- preflight --------------------------------------------------------------
banner "Fast Pull-Request Validation"
printf '  workspace     : %s\n' "${WORKSPACE}"
printf '  strict        : STRICT=%s  (1 = a missing gate is a FAILURE)\n' "${STRICT}"
printf '  java          : %s\n' "$(java -version 2>&1 | head -1)"
printf '  maven         : %s\n' "$(mvn -v | head -1)"
printf '  node          : %s / npm %s\n' "$(node -v)" "$(npm -v)"
printf '  docker cli    : %s\n' "$(docker --version)"
printf '  docker daemon : %s\n' "$(docker_available && echo reachable || echo 'UNREACHABLE')"
printf '  host workspace: %s\n' "${HOST_WORKSPACE}"
printf '  codegen image : %s\n' "$(codegen_image_available && echo "${CODEGEN_IMAGE} present" || echo "${CODEGEN_IMAGE} MISSING")"
printf '  mutation      : RUN_MUTATION=%s MUTATION_SCOPE=%s BASE_REF=%s\n' \
  "${RUN_MUTATION}" "${MUTATION_SCOPE}" "${BASE_REF}"
printf '  backend       : %s\n' "$(have_backend && echo 'backend/pom.xml present' || echo 'ABSENT')"
printf '  frontend      : %s\n' "$(have_frontend && echo 'frontend/package.json present' || echo 'ABSENT')"
printf '  workspace r/w : %s\n' "$( ((WORKSPACE_WRITABLE)) && echo writable || echo 'READ-ONLY')"

if [[ ! -d "${WORKSPACE}" ]]; then
  printf '%s\n' "${C_RED}WORKSPACE ${WORKSPACE} does not exist -- mount the repository there.${C_RESET}"
  exit 2
fi
if [[ "${STRICT}" == "1" && -n "${SKIP_STEPS}" ]]; then
  printf '%s\n' "${C_RED}SKIP_STEPS is refused under STRICT=1: a gate that the environment can switch off is not a gate.${C_RESET}"
  exit 2
fi

# Repository-owned orchestration is part of the product. Validate workflow
# schema/expressions and embedded shell, and fully resolve Compose before any
# expensive language build starts.
if [[ -d "${WORKSPACE}/.github/workflows" ]]; then
  run workflow-lint "GitHub Actions workflows (actionlint + ShellCheck)" "${WORKSPACE}" \
    actionlint
else
  start_step workflow-lint "GitHub Actions workflows (actionlint + ShellCheck)"
  unrunnable workflow-lint ".github/workflows does not exist"
fi

if [[ -f "${WORKSPACE}/docker-compose.yml" ]]; then
  run compose-config "Docker Compose model validation" "${WORKSPACE}" \
    docker compose config --quiet
else
  start_step compose-config "Docker Compose model validation"
  unrunnable compose-config "docker-compose.yml does not exist"
fi

# ===========================================================================
# 0. CONTRACT -- the OpenAPI document is the source of truth from which both
#    the Angular client and the Spring provider interface are generated, so
#    generated code that has drifted from it invalidates everything downstream.
#    It is also the cheapest possible signal, so it runs first.
# ===========================================================================
in_container() { [[ -f /.dockerenv ]]; }

docker_codegen=(docker run --rm
  -u "$(id -u):$(id -g)"
  -v "${HOST_WORKSPACE}:/workspace"
  -w /workspace
  "${CODEGEN_IMAGE}")

# Generated Angular/Spring sources are gitignored and never committed (see
# DOCKER-CONVENTIONS.md), so on a clean checkout they do not exist yet. Running
# `codegen verify` (drift vs. the contract) here, before anything has generated
# code, would diff an absent directory against fresh output and report every
# file as drift -- a clean checkout could never pass. `codegen verify` remains
# a real local-dev tool (it catches a hand-edited or stale generated tree on a
# machine that has already generated once); it is structurally incompatible
# with a from-scratch CI checkout in the "never commit generated code" model,
# so CI generates instead of verifying. The frontend gates below (lint,
# typecheck, test, build) all import from src/app/api/generated, so this step
# also materializes the one dependency between them and the contract stage.
contract_lint() {
  local step_id="contract-lint" step_desc="OpenAPI strict lint (Redocly, warnings are errors)"
  ALLOW_READONLY=1
  if in_container && [[ "${HOST_WORKSPACE}" == "${WORKSPACE}" ]]; then
    start_step "${step_id}" "${step_desc}"
    unrunnable "${step_id}" "running inside a container with HOST_WORKSPACE unset -- the codegen container is started on the HOST daemon, where '${WORKSPACE}' does not exist, so it would silently lint an empty directory; pass -e HOST_WORKSPACE=\"\${PWD}\""
  elif codegen_image_available; then
    run "${step_id}" "${step_desc}" "${WORKSPACE}" "${docker_codegen[@]}" lint
  else
    start_step "${step_id}" "${step_desc}"
    if ! docker_available; then
      unrunnable "${step_id}" "no reachable Docker daemon -- mount /var/run/docker.sock and grant the socket group (see ci/Dockerfile header)"
    else
      unrunnable "${step_id}" "the ${CODEGEN_IMAGE} image is not present; build it with: docker build -f tools/codegen/Dockerfile -t ${CODEGEN_IMAGE} ."
    fi
  fi
  ALLOW_READONLY=0
}

contract_generate() {
  local step_id="contract-generate" step_desc="generate Angular client + Spring interface from the contract"
  if in_container && [[ "${HOST_WORKSPACE}" == "${WORKSPACE}" ]]; then
    start_step "${step_id}" "${step_desc}"
    unrunnable "${step_id}" "running inside a container with HOST_WORKSPACE unset -- the codegen container is started on the HOST daemon, where '${WORKSPACE}' does not exist, so it would silently generate into an empty directory; pass -e HOST_WORKSPACE=\"\${PWD}\""
  elif (( ! WORKSPACE_WRITABLE )); then
    start_step "${step_id}" "${step_desc}"
    unrunnable "${step_id}" "workspace is read-only -- code generation writes into frontend/src/app/api/generated and backend/target/generated-sources"
  elif codegen_image_available; then
    run "${step_id}" "${step_desc}" "${WORKSPACE}" "${docker_codegen[@]}" all
  else
    start_step "${step_id}" "${step_desc}"
    if ! docker_available; then
      unrunnable "${step_id}" "no reachable Docker daemon -- mount /var/run/docker.sock and grant the socket group (see ci/Dockerfile header)"
    else
      unrunnable "${step_id}" "the ${CODEGEN_IMAGE} image is not present; build it with: docker build -f tools/codegen/Dockerfile -t ${CODEGEN_IMAGE} ."
    fi
  fi
}

contract_lint
contract_generate

# ===========================================================================
# 1. TYPE CHECKING + LINT -- cheapest code-level signal, first.
# ===========================================================================
if ! have_frontend; then
  start_step frontend-install "frontend dependency install"
  unrunnable frontend-install "frontend/package.json not found"
elif [[ ! -f "${FRONTEND}/package-lock.json" ]]; then
  start_step frontend-install "frontend dependency install"
  unrunnable frontend-install "frontend/package-lock.json missing -- QUALITY-GATES.md allows npm ci only, which needs a committed lockfile"
else
  run frontend-install "frontend dependency install (npm ci)" "${FRONTEND}" \
    npm ci --no-audit --no-fund
fi

# Each frontend gate is a required npm script. Naming the expected script in
# the failure makes the finding actionable rather than merely true.
frontend_gate() {
  local id="$1" script="$2" desc="$3"
  shift 3
  if frontend_has_script "${script}"; then
    run "${id}" "${desc}" "${FRONTEND}" npm run "${script}" "$@"
  else
    start_step "${id}" "${desc}"
    unrunnable "${id}" "QUALITY-GATES.md requires this gate but frontend/package.json has no \"${script}\" script"
  fi
}

frontend_gate frontend-format   format:check "frontend formatting (Prettier --check)"
frontend_gate frontend-lint     lint         "frontend lint (ESLint strictTypeChecked, --max-warnings=0)"
frontend_gate frontend-typecheck typecheck   "frontend TypeScript type check (strict tier)"

# Backend static analysis. Java has no separate type-check phase, so the
# formatting/style/bug gates run before compilation and the compiler's own
# -Xlint:all -Werror is the type gate.
backend_static_missing=()
pom_contains 'spotless-maven-plugin'   || backend_static_missing+=('spotless-maven-plugin')
pom_contains 'maven-checkstyle-plugin' || backend_static_missing+=('maven-checkstyle-plugin')
pom_contains 'spotbugs-maven-plugin'   || backend_static_missing+=('spotbugs-maven-plugin')
pom_contains 'maven-pmd-plugin'        || backend_static_missing+=('maven-pmd-plugin')

if ! have_backend; then
  start_step backend-static "backend static analysis"
  unrunnable backend-static "backend/pom.xml not found"
elif (( ${#backend_static_missing[@]} > 0 )); then
  start_step backend-static "backend static analysis"
  unrunnable backend-static "QUALITY-GATES.md requires these plugins, absent from backend/pom.xml: ${backend_static_missing[*]}"
else
  run backend-static "backend format/style/bugs (Spotless, Checkstyle, SpotBugs, PMD, CPD)" "${BACKEND}" \
    mvn "${MVN_FLAGS[@]}" spotless:check checkstyle:check spotbugs:check pmd:check pmd:cpd-check
fi

if have_backend; then
  # test-compile fires maven-enforcer-plugin and compiles with -Xlint:all
  # -Werror, so every javac warning is fatal here. dependency:analyze-only
  # is bound to the verify phase (Maven convention: it needs the full
  # dependency graph resolved), not test-compile, so it does NOT run in this
  # step -- it runs later, inside backend-integration's `mvn verify`.
  run backend-compile "backend compile: enforcer, -Werror javac" "${BACKEND}" \
    mvn "${MVN_FLAGS[@]}" test-compile
else
  start_step backend-compile "backend compile (Java type check)"
  unrunnable backend-compile "backend/pom.xml not found"
fi

# ===========================================================================
# 2. UNIT -- the innermost, fastest tests: JUnit + AssertJ, Vitest. Coverage
#    thresholds are part of the gate, not a report nobody opens.
# ===========================================================================
frontend_gate frontend-unit test:unit "frontend unit tests + coverage thresholds (Vitest)"

maven_reports_no_skips() {
  local id="$1" parent_step="$2" report_dir="$3" desc="$4"
  local -a reports=()
  start_step "${id}" "${desc}"
  if [[ "${STEP_STATUS[${parent_step}]:-}" != "PASS" ]]; then
    unrunnable "${id}" "${parent_step} did not pass, so its reports cannot prove that no tests were skipped"
    return
  fi
  mapfile -d '' reports < <(find "${report_dir}" -maxdepth 1 -type f -name 'TEST-*.xml' -print0 2>/dev/null)
  if (( ${#reports[@]} == 0 )); then
    unrunnable "${id}" "no JUnit XML reports found under ${report_dir}"
    return
  fi
  if grep -HEq 'skipped="[1-9][0-9]*"|<skipped([ />])' "${reports[@]}"; then
    grep -HE 'skipped="[1-9][0-9]*"|<skipped([ />])' "${reports[@]}" >&2
    fail_and_exit "${id}" "one or more tests were skipped; disabled/aborted tests cannot produce a green gate"
  fi
  pass_step "${id}" "${#reports[@]} report file(s), zero skipped tests"
}

if have_backend; then
  # Surefire's default include pattern is *Test; it carries unit tests,
  # @WebMvcTest slices, and ArchUnit. Cucumber and Pact classes are named
  # *IT (CucumberAcceptanceIT, TaskProviderPactIT) so Failsafe owns them
  # instead -- they run later, inside backend-integration's `mvn verify`.
  run backend-unit "backend unit, slice and ArchUnit tests (Surefire)" "${BACKEND}" \
    mvn "${MVN_FLAGS[@]}" test
else
  start_step backend-unit "backend unit + slice tests (Surefire)"
  unrunnable backend-unit "backend/pom.xml not found"
fi

maven_reports_no_skips backend-unit-no-skips backend-unit \
  "${BACKEND}/target/surefire-reports" "backend unit/slice/architecture reports contain no skipped tests"

# ===========================================================================
# 3. SLICE + ARCHITECTURE -- one level out: the web adapter and component
#    boundaries, plus the layering rules the design depends on.
# ===========================================================================
# These execute inside the Surefire run above. Reporting them as covered is
# only honest if they exist, so their presence is checked rather than assumed.
covered_by_backend_unit() {
  local id="$1" marker="$2" desc="$3"
  start_step "${id}" "${desc}"
  if [[ "${STEP_STATUS[backend-unit]:-}" != "PASS" ]]; then
    unrunnable "${id}" "backend-unit did not run (status: ${STEP_STATUS[backend-unit]:-none}), so these tests did not execute"
  elif ! backend_tests_contain "${marker}"; then
    unrunnable "${id}" "no test under backend/src/test references ${marker} -- this gate does not exist"
  else
    pass_step "${id}" "executed inside the Surefire run in backend-unit (${marker} present)"
  fi
}

covered_by_backend_unit backend-slice '@WebMvcTest'          'backend web slice tests (@WebMvcTest)'
covered_by_backend_unit backend-arch  'com.tngtech.archunit' 'architecture rules (ArchUnit: domain must not depend on Spring/web/persistence)'

frontend_gate frontend-component test:component "frontend component tests (Testing Library)"

# ===========================================================================
# 4. PACT (consumer side) -- the consumer generates the contract first, since
#    the provider verification below must run against what the consumer
#    actually just produced, not a copy that can go stale.
# ===========================================================================
frontend_gate frontend-pact test:pact "Pact consumer test (generates the pact)"

# There is no Pact broker (see README.md). Without one, the provider verifies
# a pact file on disk, so CI must put the consumer's freshly generated pact
# there itself -- otherwise the committed copy silently goes stale the moment
# a consumer interaction changes, and provider verification keeps passing
# against expectations nobody holds anymore. This is the one point where the
# two sides of the contract are actually connected; treat a mismatch here as
# the pipeline finding its job, not as a flake.
PACT_CONSUMER_DIR="${FRONTEND}/pacts"
PACT_PROVIDER_DIR="${BACKEND}/src/test/resources/pacts"
if [[ "${STEP_STATUS[frontend-pact]:-}" == "PASS" ]]; then
  start_step pact-sync "sync consumer pact into the provider's verification directory"
  if (( ! WORKSPACE_WRITABLE )); then
    unrunnable pact-sync "workspace is read-only -- cannot copy ${PACT_CONSUMER_DIR} into ${PACT_PROVIDER_DIR}"
  elif [[ ! -d "${PACT_CONSUMER_DIR}" ]] || [[ -z "$(find "${PACT_CONSUMER_DIR}" -maxdepth 1 -name '*.json' -print -quit 2>/dev/null)" ]]; then
    unrunnable pact-sync "frontend-pact passed but ${PACT_CONSUMER_DIR} has no *.json pact file -- nothing to sync"
  else
    rm -f "${PACT_PROVIDER_DIR}"/*.json
    mkdir -p "${PACT_PROVIDER_DIR}"
    cp "${PACT_CONSUMER_DIR}"/*.json "${PACT_PROVIDER_DIR}"/
    pact_count="$(find "${PACT_CONSUMER_DIR}" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')"
    pass_step pact-sync "copied ${pact_count} pact file(s) from ${PACT_CONSUMER_DIR}"
  fi
else
  start_step pact-sync "sync consumer pact into the provider's verification directory"
  unrunnable pact-sync "frontend-pact did not pass (status: ${STEP_STATUS[frontend-pact]:-none}) -- there is no fresh consumer pact to verify against"
fi

# ===========================================================================
# 5. RELEVANT INTEGRATION -- Testcontainers, clean state authoritative. This
#    single Failsafe run also carries the Cucumber acceptance scenarios and
#    the provider Pact verification (both are *IT classes -- Failsafe, not
#    Surefire -- see backend/pom.xml). Running it once and reporting each
#    ring from its output, instead of re-invoking Maven per ring with a
#    -Dtest filter, avoids starting Testcontainers Mongo three times and
#    avoids relying on name-pattern filters that must be kept in sync with
#    class names by hand. `verify` also runs the JaCoCo check goal.
# ===========================================================================
if ! have_backend; then
  start_step backend-integration "relevant integration tests (Testcontainers) + JaCoCo thresholds"
  unrunnable backend-integration "backend/pom.xml not found"
elif ! docker_available; then
  start_step backend-integration "relevant integration tests (Testcontainers) + JaCoCo thresholds"
  unrunnable backend-integration "no reachable Docker daemon -- Testcontainers cannot start MongoDB; mount /var/run/docker.sock and grant the socket group"
elif ! pom_contains 'jacoco-maven-plugin'; then
  start_step backend-integration "relevant integration tests (Testcontainers) + JaCoCo thresholds"
  unrunnable backend-integration "no jacoco-maven-plugin in backend/pom.xml -- QUALITY-GATES.md requires its check goal bound to verify"
else
  run backend-integration "Failsafe integration tests (Mongo, Cucumber, Pact) + JaCoCo check" "${BACKEND}" \
    mvn "${MVN_FLAGS[@]}" verify
fi

maven_reports_no_skips backend-integration-no-skips backend-integration \
  "${BACKEND}/target/failsafe-reports" "backend integration/Cucumber/Pact reports contain no skipped tests"

# A Failsafe *.txt summary is written per IT class regardless of pass/fail, so
# its presence proves the class actually ran (not merely that `mvn verify`
# exited 0), and its content gives the specific ring its own attributable
# result instead of hiding inside one aggregate "integration" pass/fail.
failsafe_report_result() {
  local id="$1" fqcn="$2" desc="$3"
  local report="${BACKEND}/target/failsafe-reports/${fqcn}.txt"
  start_step "${id}" "${desc}"
  if [[ "${STEP_STATUS[backend-integration]:-}" == "SKIP" ]]; then
    unrunnable "${id}" "backend-integration did not run (status: ${STEP_STATUS[backend-integration]:-none}), so this ring did not execute"
    return
  fi
  if [[ ! -f "${report}" ]]; then
    fail_and_exit "${id}" "no Failsafe report at ${report} -- ${fqcn} did not run inside backend-integration; check it is on the test classpath and matches Failsafe's *IT naming"
  fi
  if grep -qE 'Tests run: [1-9][0-9]*, Failures: 0, Errors: 0, Skipped: 0' "${report}"; then
    pass_step "${id}" "$(grep -oE 'Tests run: [0-9]+, Failures: [0-9]+, Errors: [0-9]+, Skipped: [0-9]+' "${report}" | head -1) (${fqcn})"
  else
    fail_and_exit "${id}" "$(grep -oE 'Tests run: [0-9]+, Failures: [0-9]+, Errors: [0-9]+, Skipped: [0-9]+' "${report}" | head -1 || echo "no test summary line found") -- see ${report}"
  fi
}

failsafe_report_result backend-cucumber com.example.loop.acceptance.CucumberAcceptanceIT \
  "Cucumber acceptance scenarios"
failsafe_report_result backend-pact com.example.loop.pact.TaskProviderPactIT \
  "Provider Pact verification"

# ===========================================================================
# 7. SCOPED MUTATION TESTS -- run incrementally on pull requests and broadly on
#    a schedule, because a full mutation run costs minutes to tens of minutes
#    and would destroy the fast feedback the rest of this gate buys.
#    MUTATION_SCOPE=changed is the PR mode; =all is the periodic run. Both fail
#    the build on their configured threshold.
# ===========================================================================
if [[ "${RUN_MUTATION}" != "1" ]]; then
  start_step mutation "scoped mutation tests (PIT + Stryker)"
  unrunnable mutation "RUN_MUTATION=${RUN_MUTATION}; mutation testing is required by QUALITY-GATES.md and is on by default under STRICT"
else
  # Incremental scoping is diff-based and needs real git history. A shallow
  # clone silently mutating everything (or nothing) is worse than saying so.
  if [[ "${MUTATION_SCOPE}" == "changed" ]] \
     && ! git -C "${WORKSPACE}" rev-parse --verify "${BASE_REF}" >/dev/null 2>&1; then
    printf '\n%s\n' "${C_YELLOW}BASE_REF '${BASE_REF}' is not resolvable in ${WORKSPACE} -- falling back to MUTATION_SCOPE=all${C_RESET}"
    MUTATION_SCOPE=all
  fi
  printf '\n%s\n' "mutation scope: ${MUTATION_SCOPE}"

  pit_args=()
  stryker_args=()
  if [[ "${MUTATION_SCOPE}" == "changed" ]]; then
    pit_args+=(-DwithHistory=true
               -DhistoryInputFile=target/pit-history
               -DhistoryOutputFile=target/pit-history)
    stryker_args+=(--since="${BASE_REF}")
  fi

  if ! have_backend; then
    start_step mutation-pit "PIT mutation testing (backend, ${MUTATION_SCOPE})"
    unrunnable mutation-pit "backend/pom.xml not found"
  elif ! pom_contains 'pitest-maven'; then
    start_step mutation-pit "PIT mutation testing (backend, ${MUTATION_SCOPE})"
    unrunnable mutation-pit "no pitest-maven plugin in backend/pom.xml -- QUALITY-GATES.md requires PIT with a failing mutationThreshold"
  else
    run mutation-pit "PIT mutation testing (backend, ${MUTATION_SCOPE})" "${BACKEND}" \
      mvn "${MVN_FLAGS[@]}" org.pitest:pitest-maven:mutationCoverage "${pit_args[@]}"
  fi

  if frontend_has_script 'test:mutation'; then
    run mutation-stryker "Stryker mutation testing (frontend, ${MUTATION_SCOPE})" "${FRONTEND}" \
      npm run test:mutation -- "${stryker_args[@]}"
  else
    start_step mutation-stryker "Stryker mutation testing (frontend, ${MUTATION_SCOPE})"
    unrunnable mutation-stryker "QUALITY-GATES.md requires Stryker with a break threshold but frontend/package.json has no \"test:mutation\" script"
  fi
fi

summary
exit "${FAILED}"
