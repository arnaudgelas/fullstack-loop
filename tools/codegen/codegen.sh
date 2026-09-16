#!/usr/bin/env bash
#
# fullstack-loop-codegen entrypoint.
#
# Owns the contract stage of the development loop:
#     [OpenAPI Contract] -> [Redocly Strict Lint] -> [Code Generation]
#
# Operates on a bind-mounted working tree at /workspace. Generated code is
# never committed; this image exists so developers can regenerate it during the
# fast local loop, and so CI can prove the checked-out tree still matches the
# contract (`verify`).
#
# Strictness (QUALITY-GATES.md): every step here fails on the first problem.
# Nothing is advisory, no step is wrapped in `|| true`, and no severity is
# downgraded anywhere in this file.
set -Eeuo pipefail

# Exit codes — stable, so CI can distinguish causes.
readonly EX_OK=0            # success
readonly EX_LINT=1          # redocly found at least one problem
readonly EX_NOSPEC=2        # contract not found under /workspace
readonly EX_DRIFT=3         # generated code in the tree != generated from the contract
readonly EX_USAGE=64        # bad command line
readonly EX_GENERATOR=70    # openapi-generator validation or generation failed

SPEC="${LOOP_SPEC:-/workspace/openapi/openapi.yaml}"
REDOCLY_CONFIG="${LOOP_REDOCLY_CONFIG:-/opt/codegen/redocly.yaml}"
readonly GENERATOR_JAR=/opt/openapi-generator/openapi-generator-cli.jar

ANGULAR_OUT="${LOOP_ANGULAR_OUT:-/workspace/frontend/src/app/api/generated}"
SPRING_OUT="${LOOP_SPRING_OUT:-/workspace/backend/target/generated-sources/openapi}"

TMPROOT=""
# Pre-declared so the ERR trap body below has a statically visible assignment.
rc=0

# Traps are written inline rather than as named functions on purpose: a function
# reachable only through `trap` reads as dead code to static analysis
# (shellcheck SC2329), and inlining removes the finding without suppressing it.
#
# ERR (with `set -E`, so it propagates into functions and subshells): report the
# failing exit status and stop. EXIT: remove the scratch tree `verify` builds.
trap 'rc=$?; echo "fullstack-loop-codegen: aborting (exit ${rc})" >&2; exit "${rc}"' ERR
trap 'if [[ -n "${TMPROOT}" && -d "${TMPROOT}" ]]; then rm -rf "${TMPROOT}"; fi' EXIT

usage() {
  cat <<'USAGE'
fullstack-loop-codegen — OpenAPI strict lint + code generation for the Fullstack Loop stack

Usage:
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD":/workspace -w /workspace \
      fullstack-loop-codegen <command>

Commands:
  lint        Redocly strict lint of openapi/openapi.yaml against the image's
              recommended-strict ruleset. ANY problem, warnings included, is an
              error and exits non-zero.
  angular     Generate the typescript-angular client into
              frontend/src/app/api/generated
  spring      Generate the Spring API interfaces (interfaceOnly,
              useSpringBoot3) into backend/target/generated-sources/openapi
  all         lint, then angular, then spring. Generation is gated behind lint:
              a contract that does not lint clean is never generated from.
  verify      Regenerate both artifacts into a throwaway directory and diff them
              against the working tree. Catches hand-edited generated code and a
              contract changed without regenerating. Writes nothing to the tree.
  version     Print the pinned tool versions
  help        This message (also printed with no arguments, or --help/-h)

Exit codes:
  0   success
  1   lint found problems
  2   contract not found under /workspace
  3   generated code has drifted from the contract (verify)
  64  bad command line
  70  openapi-generator spec validation or generation failed

Environment overrides:
  LOOP_SPEC             contract path      (default /workspace/openapi/openapi.yaml)
  LOOP_ANGULAR_OUT      angular output dir
  LOOP_SPRING_OUT       spring output dir
  LOOP_REDOCLY_CONFIG   ruleset            (default /opt/codegen/redocly.yaml)

Run as your own uid so generated files are not root-owned:
  docker run --rm -u "$(id -u):$(id -g)" -v "$PWD":/workspace -w /workspace fullstack-loop-codegen all
USAGE
}

require_spec() {
  if [[ ! -f "${SPEC}" ]]; then
    echo "fullstack-loop-codegen: contract not found at ${SPEC}" >&2
    echo "fullstack-loop-codegen: bind-mount the repository root at /workspace" >&2
    exit "${EX_NOSPEC}"
  fi
}

# openapi-generator's own structural validation, run as a gate BEFORE any
# generation. `validate --recommend` surfaces both hard errors and the
# recommendation warnings; the generator itself exits 0 on warnings, so this
# promotes any "Errors:"/"Warnings:" section to a build failure. That is what
# stops a spec which lints clean but is structurally broken from silently
# emitting junk.
validate_spec() {
  local output
  echo "==> openapi-generator validate --recommend ${SPEC}"
  if ! output="$(java -jar "${GENERATOR_JAR}" validate -i "${SPEC}" --recommend 2>&1)"; then
    printf '%s\n' "${output}" >&2
    echo "fullstack-loop-codegen: spec validation failed" >&2
    exit "${EX_GENERATOR}"
  fi
  printf '%s\n' "${output}"
  if grep -Eiq '(^|[[:space:]])(errors?|warnings?)([[:space:]]*:|[[:space:]])' <<<"${output}"; then
    echo "fullstack-loop-codegen: spec validation reported problems; warnings are errors here" >&2
    exit "${EX_GENERATOR}"
  fi
}

# openapi-generator only writes `.openapi-generator-ignore` when the output
# directory does not yet exist, and its `.openapi-generator/FILES` manifest
# therefore differs between a first generation and a re-generation over an
# existing tree. That makes generation non-idempotent and `verify` unstable, and
# it also leaves orphaned files behind when the contract drops an operation.
#
# Fix: always generate into a clean directory. The guard refuses to delete
# anything that openapi-generator did not produce — a directory is only removed
# if it carries the generator's own `.openapi-generator/VERSION` marker — so a
# mistyped LOOP_ANGULAR_OUT/LOOP_SPRING_OUT cannot destroy source.
reset_output_dir() {
  local out=$1
  if [[ ! -e "${out}" ]]; then
    return 0
  fi
  if [[ ! -f "${out}/.openapi-generator/VERSION" ]]; then
    echo "fullstack-loop-codegen: refusing to overwrite ${out}" >&2
    echo "fullstack-loop-codegen: it exists but was not produced by openapi-generator" >&2
    echo "fullstack-loop-codegen: (no .openapi-generator/VERSION marker found)" >&2
    exit "${EX_USAGE}"
  fi
  rm -rf "${out}"
}

# --strict-spec=true: hold the document to the 'MUST'/'SHALL' wording of the
# OpenAPI specification instead of quietly applying compatibility fixups.
# --skip-validate-spec is deliberately NOT passed anywhere in this file.
#
# A generator WARN is also a failure here. openapi-generator exits 0 while
# silently papering over a contract — e.g. "Empty operationId found ... Renamed
# to auto-generated operationId" — which is precisely the silent junk this gate
# exists to stop. On failure the half-written output directory is removed so a
# failed run can never leave a partial tree behind that looks generated.
run_generator() {
  local label=$1 out=$2
  shift 2
  local output
  echo "==> openapi-generator generate (${label})"
  reset_output_dir "${out}"
  if ! output="$(java -jar "${GENERATOR_JAR}" generate --strict-spec=true -o "${out}" "$@" 2>&1)"; then
    printf '%s\n' "${output}" >&2
    rm -rf "${out}"
    echo "fullstack-loop-codegen: generation failed for ${label}" >&2
    exit "${EX_GENERATOR}"
  fi
  printf '%s\n' "${output}"
  if grep -Eiq '(^|[[:space:]])(warn(ing)?|errors?)([[:space:]:]|$)' <<<"${output}"; then
    rm -rf "${out}"
    echo "fullstack-loop-codegen: generator reported warnings for ${label}; warnings are errors here" >&2
    exit "${EX_GENERATOR}"
  fi
}

gen_angular() {
  local out=$1
  # Mirrors frontend/package.json `generate:api`. withInterfaces=true is
  # required: the 7.16.0 api.ts template unconditionally re-exports
  # ./tasks.serviceInterface, so a client generated with it false does not
  # resolve.
  run_generator "typescript-angular -> ${out}" "${out}" \
    -i "${SPEC}" \
    -g typescript-angular \
    --additional-properties=ngVersion=20.0.0,providedInRoot=true,fileNaming=kebab-case,withInterfaces=true,useSingleRequestParameter=false
}

gen_spring() {
  local out=$1
  # Mirrors backend/pom.xml openapi-generator-maven-plugin configuration so CLI
  # regeneration and `mvn generate-sources` agree.
  #
  # hideGenerationTimestamp=true is added on top: without it every Java file
  # carries a wall-clock @Generated(date = ...), which makes generation
  # irreproducible and `verify` meaningless. backend/pom.xml needs the same
  # option for the two paths to match byte for byte.
  run_generator "spring -> ${out}" "${out}" \
    -i "${SPEC}" \
    -g spring \
    --library spring-boot \
    --api-package com.example.loop.api \
    --model-package com.example.loop.api.model \
    --global-property apis,models,supportingFiles,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false \
    --additional-properties=interfaceOnly=true,useSpringBoot3=true,useTags=true,useJakartaEe=true,openApiNullable=false,documentationProvider=none,annotationLibrary=none,skipDefaultInterface=true,performBeanValidation=true,useBeanValidation=true,hideGenerationTimestamp=true
}

do_lint() {
  require_spec
  echo "==> redocly lint (recommended-strict) ${SPEC}"
  if ! redocly lint "${SPEC}" --config "${REDOCLY_CONFIG}" --format stylish; then
    exit "${EX_LINT}"
  fi
}

do_angular() {
  require_spec
  validate_spec
  gen_angular "${ANGULAR_OUT}"
  echo "==> angular client -> ${ANGULAR_OUT}"
}

do_spring() {
  require_spec
  validate_spec
  gen_spring "${SPRING_OUT}"
  echo "==> spring interfaces -> ${SPRING_OUT}"
}

# ACCEPTED DEVIATION (narrow, one attribute): strip the @Generated `date`
# attribute before diffing. It is a wall-clock stamp emitted by the generator,
# never derived from the contract, so it can never evidence drift. Stripping it
# on BOTH sides also lets `verify` compare a Maven-generated tree (which still
# carries the stamp until backend/pom.xml sets hideGenerationTimestamp) against
# this image's output. Nothing else is normalised: every other byte must match.
normalise_tree() {
  local dir=$1
  find "${dir}" -type f -name '*.java' -exec \
    sed -i -E 's/, date = "[^"]*"//' {} +
}

# ACCEPTED DEVIATION (narrow, two paths): drop openapi-generator's own
# bookkeeping before diffing — the `.openapi-generator/` directory and
# `.openapi-generator-ignore`. None of it is contract-derived code:
#   * `.openapi-generator/FILES` only lists `.openapi-generator-ignore` on a
#     first generation, so its content depends on whether the target directory
#     already existed;
#   * the Maven plugin additionally writes an `*.sha256` up-to-date cache that
#     the CLI does not.
# Comparing it would report drift purely from *how* the tree was generated
# (this CLI vs `mvn generate-sources`). Every generated source file is still
# compared byte for byte, and FILES is redundant with that comparison: a file
# added, removed or renamed shows up in the diff directly.
strip_bookkeeping() {
  local dir=$1
  rm -rf "${dir}/.openapi-generator" "${dir}/.openapi-generator-ignore"
}

compare_tree() {
  local label=$1 actual=$2 expected=$3
  # Compared under a common root with speaking directory names, so both the
  # diff headers and diff's "Only in ..." lines are readable in CI logs.
  local root="${TMPROOT}/cmp"
  local actual_copy="${root}/working-tree/${label}"
  local expected_copy="${root}/from-contract/${label}"
  mkdir -p "${root}/working-tree" "${root}/from-contract"

  if [[ ! -d "${actual}" ]]; then
    echo "fullstack-loop-codegen: DRIFT — ${label}: ${actual} does not exist; run 'fullstack-loop-codegen ${label}'" >&2
    return 1
  fi

  cp -R "${actual}" "${actual_copy}"
  cp -R "${expected}" "${expected_copy}"
  strip_bookkeeping "${actual_copy}"
  strip_bookkeeping "${expected_copy}"
  normalise_tree "${actual_copy}"
  normalise_tree "${expected_copy}"

  if (cd "${root}" && diff -ru "working-tree/${label}" "from-contract/${label}"); then
    echo "==> ${label}: up to date"
    return 0
  fi
  echo "fullstack-loop-codegen: DRIFT — ${label} in the working tree does not match the contract" >&2
  echo "fullstack-loop-codegen: '-' is your tree, '+' is what the contract generates" >&2
  return 1
}

do_verify() {
  require_spec
  validate_spec
  TMPROOT="$(mktemp -d)"

  gen_angular "${TMPROOT}/angular" >/dev/null
  gen_spring "${TMPROOT}/spring" >/dev/null

  local drift=0
  compare_tree angular "${ANGULAR_OUT}" "${TMPROOT}/angular" || drift=1
  compare_tree spring "${SPRING_OUT}" "${TMPROOT}/spring" || drift=1

  if (( drift )); then
    echo "fullstack-loop-codegen: generated code is stale or hand-edited." >&2
    echo "fullstack-loop-codegen: fix it with 'fullstack-loop-codegen all' — never by editing generated files." >&2
    exit "${EX_DRIFT}"
  fi
  echo "==> generated code matches the contract"
}

do_version() {
  # Each command is run on its own line so its exit status is checked by
  # `set -e` rather than masked inside a command substitution (SC2312).
  local node_version redocly_version java_version generator_version
  node_version="$(node --version)"
  redocly_version="$(redocly --version)"
  java_version="$(java -version 2>&1 | head -1)"
  generator_version="$(java -jar "${GENERATOR_JAR}" version)"
  echo "node            ${node_version}"
  echo "redocly         ${redocly_version}"
  echo "java            ${java_version}"
  echo "openapi-gen     ${generator_version}"
}

main() {
  case "${1:-help}" in
    lint)              do_lint ;;
    angular)           do_angular ;;
    spring)            do_spring ;;
    all)               do_lint; do_angular; do_spring ;;
    verify)            do_verify ;;
    version|--version) do_version ;;
    help|--help|-h)    usage ;;
    *)
      echo "fullstack-loop-codegen: unknown command '$1'" >&2
      echo >&2
      usage >&2
      exit "${EX_USAGE}"
      ;;
  esac
  exit "${EX_OK}"
}

main "$@"
