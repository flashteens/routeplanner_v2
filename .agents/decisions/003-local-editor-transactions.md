# ADR 003: Local Editing Uses Recoverable Drafts and Atomic Transactions

## Status and Scope

- Status: accepted; consolidated 2026-10-20 from file-only editing, Undo/Redo, bulk editing, and incomplete-connection repair decisions.
- Scope: editor persistence, pending fields/connections, validation, cancellation, history, CSV, and diagnostics.

## Decision and Rationale

- Keep formal network documents separate from unfinished UI input. A new connection can intentionally omit its destination/transfer target without weakening portable JSON validation.
- Allow independent field repair and editing of other values while a connection is incomplete. Commit only a valid complete candidate; cancel without leaving partial data or phantom history.
- Make one deliberate user action one reversible transaction, including cascading deletes and bulk updates.
- Treat downloaded JSON, including safe history, as the complete portable artifact. CSV is a scoped partial editing interface with a full diff preview and second confirmation.
- Use editor-only warnings to expose unfinished topology without changing source data or planner output.

## Rejected Alternatives

- A server/database save button or a JSON-to-text action that implies published data was changed or a file was saved.
- Persisting placeholder/blank endpoints or drawing invalid new edges so the existing renderer must accept malformed documents.
- Each station picker requiring all other station drafts to be valid before its own repair can proceed; this caused a mutual submission deadlock.
- Copying source bends into a continued edge, silently discarding pending edits on navigation, or marking preview/language changes as a successful download.
- Applying CSV changes before the user sees cascading deletions, or replacing an entire object with only the listed CSV columns.
- Fixing warning-listed maps automatically when the owner explicitly reserved those edits for later manual work.

## Consequences and Exceptions

- Navigation/export/preview guards, cancellation, no-op behavior, history replay, and malformed imports require browser as well as unit tests.
- Existing-ID CSV rows retain bends; new/continued connections start without them. Continuing a ride/walk uses the previous destination as departure, while continuing a transfer retains its station/source and clears its target.
- A first station transfer derives two distinct connected route IDs without directions; missing endpoints remain drafts.
- Existing valid route data can be imported for repair under portable schema rules; stricter editor direction requirements still gate export/preview.

## Directory & Structural Constraints

- UI coordination belongs in `src/Editor.jsx`, field/picker components, `BatchEditor.jsx`, and `TransferGraph.jsx`.
- Reusable transaction, history, diff, creation, and diagnostic logic belongs in `shared/editor-*` and related shared modules.
- Follow [editor and history](../rules/editor-and-history.md). Do not add placeholder fields to the persisted network to represent a local draft.

## Code Quality & Style Guidelines

- Construct immutable candidates, validate before commit/replay, and preserve the current document and cursor on errors.
- Preserve safe unknown/unlisted fields and multilingual content. Deep-copy inherited nested settings for a distinct connection.
- Validate complete history chains and provide explicit recovery choices. Never mutate valid route data to repair a damaged chain.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify formal data, local draft state, and the user transaction boundary.
2. Specify repair, completion, cancellation, no-op, and navigation/export behavior.
3. Check cascading changes, ID allocation, unknown-field preservation, and history replay/recovery.
4. Exercise interrupted and successful flows in the browser and verify that only valid completed transactions reach JSON/history.

## Evidence and Supersession

- Evidence: editor-history, editor-batch, editor-repairs, blank-editor, and editor-directions unit/browser tests.
- Sources: current `docs/data-format.md` and dated editor/CSV/draft-recovery entries in `docs/verification.md`.
- Older text-based JSON save controls, cross-field draft flushing, and copied-bend continuation behavior are superseded.
