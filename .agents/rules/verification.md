# Verification Without Private Dependencies

## Required Quality Model

- V2 owns its correctness tests. Private V1 source is an optional additional oracle, not a requirement to contribute to the public repository.
- Preserve independent V2 fixture tests for routing, directions, boarding, familiarity, fares, geometry, editor transactions, CSV, and compatibility. Do not replace them with comparisons against the same function under test.
- API equality with imported `findRoute()` proves integration consistency, not independent algorithm correctness. SSR assertions prove readable/escaped output, not optimality of a route.
- `npm test` runs all V2 suites and skips V1-only comparison cases when the legacy directory is absent. A present but incomplete/mismatched V1 tree is a failure, not permission to skip assertions silently.
- `npm run verify` always runs its selected V2 checks. If the default V1 directory is absent, only the optional final V1 hash audit is skipped, with explicit output. No V1 parity/audit is claimed.
- `--skip-legacy` explicitly selects V2-only browser/API verification, even when V1 is installed. It does not skip browser, API, offline, or editor checks.
- `--require-legacy` requires the optional V1 audit. Explicit `LEGACY_ROOT` also requires a valid directory unless `--skip-legacy` was selected. A misspelled configured directory must not become an unnoticed success. The two flags cannot be combined.
- V1 parity is performed by the legacy-dependent unit cases; `verify` audits legacy file immutability. Do not describe either one as the other.

## Public V2 Workflow

- Use the lockfile and Node.js 22.12+. Install dependencies if needed with `npm ci`; do not upgrade to prepare a handoff.
- Run the relevant focused unit tests, then the existing suite and a production build for a substantive change:

```sh
npm test
npm run build
```

- Install the Playwright browser matching the locked package if it is not available, using the same browser path for installation and verification:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-cache" npx playwright install chromium --only-shell
npm run verify -- --skip-legacy
```

- `npm run verify` without a flag also supports an ordinary V2-only checkout by reporting an absent optional V1 audit. The explicit flag makes the selected scope reproducible.
- `npm run verify -- --api-only --skip-legacy` checks API/HTML only; it is not a substitute for browser/mobile/offline checks on UI changes.
- Build first: browser verification serves production `dist/`. Existing old build output can produce misleading failures or passes.

## Optional Additional V1 Checks

```sh
LEGACY_ROOT=/path/to/private/v1 npm test
LEGACY_ROOT=/path/to/private/v1 npm run verify -- --require-legacy
```

- Keep the V1 checkout read-only. Never publish it or copy private source into tests to avoid optional coverage labels.
- Preserve approved V2 correction exclusions. A hash failure requires an investigation, not blanket baseline regeneration.
- `.git/` is excluded from the legacy file audit. Other documented reference content remains protected.

## Directory & Structural Constraints

- Place domain fixture tests in `tests/*.test.js`; register new standalone test files in `package.json` when appropriate to the existing runner.
- Place browser scenarios in `scripts/verify-*.js` and integrate them into `scripts/verify.js`.
- Keep optional audit-mode selection in `scripts/verification-context.js`. Do not put private-source availability checks into runtime routing or editor components.
- Store generated screenshots/logs/browser binaries in ignored development locations such as `test-results/` and `.browser-cache/`.
- Keep host-specific Playwright platform overrides and font paths in local setup, not public runtime requirements. Never distribute proprietary host fonts as site assets.

## Code Quality & Style Guidelines

- Report passed, failed, skipped, and unavailable coverage separately. Missing browser libraries/fonts or private V1 input are environment/coverage facts, not proof of a routing regression.
- Use actual DOM/SVG interaction for gesture, file, history, focus, and viewport assertions. Wait for observable UI completion rather than assuming a click completed asynchronous effects.
- Preserve meaningful expected values and synthetic invariants. Do not assert permanent absolute coordinates for hand-edited map stations.
- Run checks appropriate to the change; do not invent a lint/type-check command or claim a Docker build/deployment that was not performed.
- Once relevant checks pass, do not repeat them without a new change, failure, or unresolved concern. Documentation-only work needs link/context checks; the optional-V1 tooling change also needs mode and integration checks.
- Baseline counts and versions belong in dated `docs/verification.md` entries, not immutable rules.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. State the behavioral regression risk and choose a V2-owned assertion independent of private data.
2. Identify required build/browser/offline setup and whether optional V1 evidence is available or intentionally excluded.
3. Check failure/no-op/cancellation cases as well as success, and verify the proposed expected values are not author-editable data assumptions.
4. Run and report the actual coverage scope, inspect the final diff, and preserve unresolved limitations honestly.
