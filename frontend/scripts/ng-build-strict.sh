#!/usr/bin/env bash
#
# QUALITY-GATES.md: "the production build must emit no warnings."
#
# The Angular builder prints warnings (deprecations, budget warnings, CommonJS
# dependencies, unresolved imports) without failing, so this wrapper turns any
# warning line into a build failure. It never downgrades a failure: ng's own
# exit status is honoured first.
set -Eeuo pipefail

output_file="$(mktemp)"
trap 'rm -f "${output_file}"' EXIT

set +e
npx ng build --configuration production 2>&1 | tee "${output_file}"
status="${PIPESTATUS[0]}"
set -e

if [ "${status}" -ne 0 ]; then
  echo "ng build failed with exit code ${status}" >&2
  exit "${status}"
fi

if grep -Eiq '(^|[^[:alnum:]])warn(ing)?[^[:alnum:]]|⚠' "${output_file}"; then
  echo "" >&2
  echo "FAIL: the production build emitted warnings, which this repo treats as errors." >&2
  grep -Ein '(^|[^[:alnum:]])warn(ing)?[^[:alnum:]]|⚠' "${output_file}" >&2
  exit 1
fi

echo "Production build clean: no warnings."
