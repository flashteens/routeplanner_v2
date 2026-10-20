# ADR 001: Portable V2 Ownership and Optional V1 Verification

## Status and Scope

- Status: accepted; consolidated 2026-10-20 from the handoff discussion and the owner's explicit public-V2 clarification.
- Scope: network ownership, runtime architecture, contributor workflow, and quality checks when private V1 is unavailable.

## Decision and Rationale

- V2 is public and self-contained. Runtime data is declarative JSON; editing is local browser state; server endpoints are read-only.
- V1 remains private/optional reference material. Preserve its read-only audit and unaffected-behavior comparisons when available, while keeping V2-owned regression gates usable without it.
- Keep author-maintained V2 JSON authoritative for current published content. Migration is a reconstruction tool and cannot be presumed to reproduce later manual changes.
- Preserve local-only editing/committing and no automatic push/deployment. Contributor identity belongs to the actual contributor; the owner-session requirement to use FlashTeens does not apply to unrelated contributors.
- Distinguish V2 correctness, browser/API integration, legacy parity, and legacy immutability as different evidence categories.

## Rejected Alternatives

- Requiring every public contributor to possess the private PHP project or its original absolute filesystem path.
- Shipping copied private source or fabricated V1 fixtures just to turn a skipped comparison into a reported pass.
- Disabling a whole browser suite because the final legacy audit input is absent.
- Silently ignoring an explicitly configured but unavailable V1 directory.
- Treating a generated network or an old hash baseline as permission to overwrite current authored data.

## Consequences and Exceptions

- Public verification reports missing optional V1 coverage explicitly. Strict opt-in legacy auditing remains available; present but invalid inputs fail.
- Approved operational/time/layout differences need independent V2 tests and documented legacy comparison exclusions.
- Owner paths, credentials, and skill installations remain outside shared rules. Node-runtime and Docker execution remain supported.
- Publication or a changed contributor workflow requires explicit authorization; this record is not a deployment grant.

## Directory & Structural Constraints

- Runtime ownership: `public/data/`, `shared/`, `src/`, `server/`.
- Optional reference loading: `scripts/legacy.js`; audit-mode selection: `scripts/verification-context.js`; regression comparisons: `tests/routing.test.js`.
- Read [data ownership](../rules/data-ownership.md) and [verification](../rules/verification.md) before changing this boundary.

## Code Quality & Style Guidelines

- Keep JSON nonexecutable and validated. Preserve lockfile/runtime compatibility and explicit errors.
- Do not weaken V2 fixture assertions, private file protection, or explicit strict-mode failures to manufacture success.
- Report skipped V1 evidence separately from successful V2 checks. Do not describe API equality against the same router as an independent oracle.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Determine whether the proposed dependency/data is public runtime input, V2 test data, or optional private evidence.
2. Verify that a fresh V2 checkout can still run the affected feature and its correctness checks.
3. Check explicit legacy configuration, audit failure behavior, publication authorization, and actual contributor identity.
4. Verify both public-only and available-V1 paths and record any approved successor decision.

## Evidence and Supersession

- Implementation: `scripts/verification-context.js`, `scripts/verify.js`, `scripts/legacy.js`, `shared/network.js`, and the read-only server.
- Behavioral evidence: `tests/verification-context.test.js`, V2 fixture suites, optional routing parity cases, and browser verification.
- Historical background: `docs/migration.md` and dated `docs/verification.md` entries. Older unconditional legacy-verification requirements are superseded by the public-V2 clarification.
