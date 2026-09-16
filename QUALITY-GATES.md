# Quality gates — binding for every component

The rule for this repo: **a warning is a build failure.** If a tool can be told to
treat warnings as errors, it is told to. If a rule set has a stricter tier, we are
on it. Nothing is advisory.

Two things are FORBIDDEN as ways of going green:

1. Silencing a rule to avoid fixing the code. Fix the code.
2. Reporting a gate as passing that you did not actually run.

If a rule genuinely cannot be satisfied, it may be suppressed ONLY at the narrowest
possible scope (one line / one file, never globally), with an inline comment giving
the reason, and it must be listed in your report as an accepted deviation. A blanket
disable in a config file is not acceptable.

## Universal

- Every gate runs in CI *and* fails the Docker image build where it can.
- `set -Eeuo pipefail` in every shell script. `shellcheck` clean at default severity.
- Every `Dockerfile` passes `hadolint` with `--failure-threshold style` (its strictest
  usable level) — pinned `apt`/`apk` versions, no `latest`, no unpinned `pip`/`npm -g`.
- No tool invoked with a flag that downgrades severity (`--no-fail`, `|| true`,
  `continue-on-error`, `-DskipTests`, `--passWithNoTests`).

## Backend (Java / Maven)

- `maven-compiler-plugin`: `<compilerArgs>` `-Xlint:all` **and** `-Werror`. Every javac
  warning is fatal. Add `-parameters`.
- `maven-enforcer-plugin`, failing the build: `requireJavaVersion` 21, `requireMavenVersion`,
  `dependencyConvergence`, `banDuplicatePomDependencyVersions`, `requireUpperBoundDeps`.
- `maven-dependency-plugin:analyze-only` with `failOnWarning=true` — no used-undeclared
  or unused-declared dependencies.
- **Spotless** (or equivalent) in `check` mode, failing on any formatting drift.
- **Checkstyle** on a strict ruleset, `failOnViolation=true`, `violationSeverity=warning`.
- **SpotBugs** with `effort=Max`, `threshold=Low`, `failOnError=true`; add `fb-contrib`
  or `find-sec-bugs` if it does not fight the build.
- **PMD** + **CPD** with `failOnViolation=true`.
- **NullAway / Error Prone** if it can be made to work cleanly on Java 21 + Boot 3.5;
  if it cannot, say so honestly rather than half-wiring it.
- **ArchUnit** test enforcing the layering the architecture requires: `domain` must not depend on
  Spring, on `web`, or on `persistence`; `web` must not reach into `persistence` directly.
  This is the architectural invariant of the whole design — make it executable.
- **JaCoCo** `check` goal with real thresholds, bound to `verify`, failing the build.
- **PIT mutation testing** (the scoped mutation-testing gate) with a `mutationThreshold`
  that fails the build. Scoped/incremental by default.
- Surefire/Failsafe: `failIfNoSpecifiedTests`, and no silent skipping.
- Spring: fail fast on unknown/invalid configuration properties.

## Frontend (TypeScript / Angular)

- `tsconfig`: `strict: true` plus every additional check — `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`,
  `noUnusedParameters`, `useUnknownInCatchVariables`, `forceConsistentCasingInFileNames`.
- Angular `compilerOptions`: `strictTemplates`, `strictInjectionParameters`,
  `strictInputAccessModifiers`, and `extendedDiagnostics.defaultCategory: error`.
- ESLint run with **`--max-warnings=0`**, on `typescript-eslint` **`strictTypeChecked`**
  + `stylisticTypeChecked` (type-aware linting, not the basic set), plus
  `angular-eslint` recommended **and** the template accessibility rules.
- Prettier (or equivalent) in `--check` mode.
- Vitest: coverage thresholds that actually fail, and `--coverage` wired into the gate.
- **Stryker** mutation testing with a `break` threshold.
- Angular build budgets set to `error`, and the production build must emit no warnings.
- `npm ci` only — never `npm install` in CI or in an image.

## e2e / CI

- Playwright: `forbidOnly: true`, `retries: 0` by default (a retry hides a flake — if a
  journey needs retries, that is a bug to report, not a setting), `strict: true` locators,
  and failure on unexpected console errors / page errors.
- axe-core: fail on **any** violation, not just serious/critical. If a rule must be
  excluded, exclude that one rule inline with a written reason.
- e2e TypeScript held to the same strict tsconfig as the frontend.
- `pr-validation.sh`: a missing or unrunnable step is a **FAILURE**, not a SKIP, whenever
  `STRICT=1` (which CI sets). The permissive SKIP path may remain only for local use.
- The PR gate runs every gate above, in the documented gate order, and stops at the first failure.

## Contract / codegen

- Redocly `recommended-strict`, no rule overrides beyond what the lead has explicitly
  approved in writing, and warnings treated as errors.
- The generators run with strict validation enabled; generated code must compile under
  the same `-Werror` / `strictTypeChecked` settings as hand-written code. If generated
  code cannot satisfy a rule, exclude the generated directory from that one rule
  explicitly and say so — never relax the rule for hand-written code.
