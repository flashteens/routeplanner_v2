# Shared Agent Context Index

- Purpose: make domain intent, architectural boundaries, and regression obligations portable with the public V2 repository.
- Read [the root contract](../AGENTS.md) first. This directory contains shared instructions, not a private agent's memory dump.
- These Markdown files are repository instructions. `skills/`, `local/`, caches, credentials, tool installations, and personal settings are excluded from the shared context.
- Use the current user's explicit instructions to resolve authorized changes to these defaults. Do not treat a historical log or a machine-local skill as higher authority.

## Directory & Structural Constraints

- `rules/data-ownership.md`: published data, optional legacy inputs, regeneration, approved discrepancies, contributor identity, local-only publication policy.
- `rules/routing.md`: passenger states, directions, transfer endpoints, operational/display separation, service options and comparator behavior.
- `rules/time-and-fares.md`: dwell conventions, familiarity formula, variants, distance units, origin-destination fares.
- `rules/map-rendering.md`: geometry, station shapes, coordinate inference, viewport behavior.
- `rules/editor-and-history.md`: drafts, validation, history, CSV, file operations, warnings, and defaults.
- `rules/i18n-and-offline.md`: language ownership, product wording, mobile/accessibility, offline storage, SSR/API presentation.
- `rules/verification.md`: self-contained V2 checks, optional V1 evidence, browser setup, failure reporting.
- `decisions/`: rationale and rejected alternatives. A decision record supplements the rules; it is not a competing instruction hierarchy.
- Do not create nested `AGENTS.md` files merely to split this text. Add one only for a real directory-specific scope and document its interaction with the root contract.
- Do not assume the entire directory is automatically loaded by every agent product. Required-reading links in the root contract are the shared entry mechanism.

## Code Quality & Style Guidelines

- Write shared context in precise English. MUST/MUST NOT denote contractual behavior; SHOULD denotes guidance. Do not invent obligations unsupported by an accepted decision.
- Separate invariant behavior from current implementation details and historical snapshots. Package versions, station counts, screenshots, test totals, and host paths are not permanent architectural truths.
- Reference actual module and test paths. Keep rules compact enough to read and give risky exceptions an explicit rationale.
- Keep detailed schema examples in `docs/data-format.md`; link to them instead of maintaining an incompatible second schema.
- Do not duplicate private V1 source, full conversations, secrets, or local tooling instructions here.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Determine which rule files apply to the requested change and read them.
2. Check whether the apparent requirement is current, historical, or an implementation observation.
3. Resolve material ambiguity using repository facts first, then a focused user interview if needed; do not reopen accepted decisions unnecessarily.
4. Check that any changed rule, decision, implementation, and behavioral test tell the same story; report concise conclusions and evidence.
