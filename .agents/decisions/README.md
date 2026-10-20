# Architecture Decision Record Index

- Purpose: preserve why a design was accepted and which tempting alternatives were rejected. These records complement [the root contract](../../AGENTS.md) and current domain rules.
- All initial records below consolidate previously accepted owner decisions; the public V2-only verification requirement was additionally confirmed on 2026-10-20.
- [001: Portable V2 ownership and optional V1 verification](001-portable-v2-and-optional-v1.md).
- [002: Operational identity separated from presentation](002-operational-identity.md).
- [003: Transactional local editing and recoverable drafts](003-local-editor-transactions.md).
- [004: Derived map geometry and horizontal extrapolation](004-derived-geometry-and-placement.md).
- Do not treat a chronological verification paragraph or an abandoned implementation as a current decision.

## Directory & Structural Constraints

- Add a numbered descriptive Markdown record here for a material architecture/domain decision. Keep current actionable rules in `../rules/` and detailed schema in `../../docs/data-format.md`.
- A record must state status, scope, decision, rationale, rejected alternatives, consequences, evidence, and supersession/exception handling.
- Preserve older records when superseding them; add a clear successor reference. Do not silently delete the history of a rejected approach.
- Do not store full conversations, private V1 source, host paths, credentials, or personal author identities as universal requirements.

## Code Quality & Style Guidelines

- Use precise English with bounded claims. Distinguish established intent, an implementation choice, and a known issue.
- Reference actual modules/tests. Do not declare a new guarantee merely because it would be architecturally desirable.
- Keep read-compatible legacy fields and approved behavioral exceptions visible when a decision affects validation or persistence.
- Avoid copying whole schema definitions or implementation code into records; those copies drift.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify the actual unresolved decision and evidence already available from code, data, or accepted discussion.
2. Identify the behavior/compatibility tradeoff and whether user clarification is genuinely necessary.
3. State the accepted outcome, rejected alternatives, and required changes to rules, code, and tests.
4. Record the evidence and supersession relationship without presenting internal deliberation as a deliverable.
