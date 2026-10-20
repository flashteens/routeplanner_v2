# Editor State, Transactions, History, and Diagnostics

## Document and Draft Boundaries

- Editing is local browser memory. Only an explicit file download preserves the complete document; there is no server write, autosync, or database save.
- Keep committed network state, field drafts, connection drafts, and derived views separate. Unfinished or invalid values MUST NOT enter formal JSON, route calculations, map edges, or history.
- A field's valid station selection must be independently repairable while the other station field is empty. Do not recreate a cross-field `flushDrafts()` deadlock.
- Temporarily equal endpoints may be held as an existing-connection draft. Repairing both fields commits a valid result; cancelling restores the original document. Clear recovered pending-edit notices automatically.
- A pending connection allows editing other fields. It blocks export, preview, bulk operations, and switching to another item/tab until completed or cancelled. Do not silently discard it or serialize a placeholder station.
- Preserve separate portable-schema validation and stricter editor direction validation. Imported older documents may be loaded for repair; export/preview must enforce the editor contract. History validates its own safe portable document states.
- Ride forward direction is required; reverse is required only when bidirectional. Walk directions are optional. If both ordinary direction codes are filled, they must differ, even when reverse operation is disabled.
- Arrival codes remain optional and are not ordinary direction labels. Do not impose a ban on matching an arrival code to an ordinary direction code.
- Multilingual direction text is optional. Bulk application matches actual `lineId` plus direction across both slots, preserves all languages, lists distinct existing content before confirmation, and commits as one operation.

## Creation, Selection, and Transfer Navigation

- Generate new connection IDs using the shared increment rule, considering current IDs and retained Undo/Redo history. Preserve existing custom IDs.
- When continuing a selected ride/walk, deep-copy applicable settings, use its destination as the new departure, leave the new destination blank, and clear bends. Do not automatically recalculate away copied explicit settings.
- When continuing a selected transfer, copy its station, source endpoint, and other settings; leave the target endpoint blank.
- Complete copied connections only after they are valid and all relevant pending fields are committed. Record one addition; cancellation leaves no edge or history entry.
- Keep the original general defaults when no existing connection is selected. Manual direction/mileage overrides disable automatic inference.
- Station editing must offer access to its first existing transfer and a transfer-graph action back to that station.
- If no transfer exists, derive the first transfer from the first two distinct connected ride/walk route IDs, without direction suffixes. With one route, fill only the source; with none, leave both blank. Use the normal pending-connection workflow when incomplete.
- The blank network `_blank` is editor-only, not a published system or planner/API network. Empty-state actions must not throw JavaScript errors.
- New ordinary stations appear at the current visible center; new batch stations use the placement estimator. Neither action should unexpectedly refit the camera.

## Atomic History and Data Safety

- A user operation is the transaction boundary. Batch application, direction-label application, and cascading station deletion must be individually reversible as one group.
- `editorHistory` stores safe before/after differences and collection ordering, with at most 100 total past/future groups. Do not replace it with a full-network snapshot per pointer movement.
- Consecutive movement of the same entity/property can merge across input methods without a timer. Another target/property ends the group; label movement and station movement are different targets.
- A real new edit removes the redo branch; a rejected/no-op edit must not erase it. Returning a merged move to its initial state may eliminate that zero-diff group.
- Validate replay shape, IDs, JSON safety, preconditions, candidate state, and ordering before moving the cursor. Failed replay preserves the network and cursor.
- Validate the full history chain on import/export. Reject invalid networks; offer explicit cancellation or documented history recovery when only history is damaged. Never alter a valid loaded network to force history to fit.
- After replay failure, a later valid edit may retain the verifiable suffix and create a valid new branch. Do not merge it into a failed movement group.
- Native text-field Undo shortcuts remain native. Global Undo/Redo must not steal input/textarea/select editing or operate behind a modal bulk editor.
- Track undownloaded changes using the whole document, including history and pending drafts. Preview/language changes are not a download. Confirm system changes and use `beforeunload` for leaving/reloading when needed.
- A download baseline records successfully initiated download, since the browser cannot prove the user's final operating-system save-dialog decision.

## CSV and Diagnostics

- CSV is a partial editing surface, not a complete backup. State this prominently and direct users to Download JSON.
- Station CSV edits only ID, English name, Chinese name, and game XYZ. Preserve styles, other languages, map positions, and unlisted data on existing stations.
- Travel CSV is scoped to one operational route; transfer CSV to one station. Reject attempts to overwrite another scope's existing connection.
- Empty connection IDs mean insert with automatic numbering; reserve explicit new IDs first. Existing IDs preserve bends/unlisted data; inserted connections have no bends.
- Removing a row deletes the scoped item. A changed station ID is delete-plus-insert, not automatic reference renaming. Preview all cascading connection/alias/fare deletions.
- Parse real CSV quoting, multiline cells, JSON cells, booleans, and numeric fields. Show all insert/update/delete details before a second confirmation; only then apply one atomic transaction.
- Unchanged generated CSV must round-trip with zero changes, including absent/empty representations and disabled conditional-time lists.
- Warnings are editor-only advice: no arrival route, disconnected station-transfer groups, or uncovered external connections. They are not schema errors, a planner overlay, or authorization to repair published data.
- Diagnostic connectivity ignores transfer arrow direction and uses existing wildcard/arrival semantics. Ordinary same-line continuation is exempt; distinct operational IDs remain distinct. Evaluate configured connections independently of current query-option filtering.
- Transfer graph nodes retain exact IDs/colors; edges show base seconds, directionality, and asymmetric reverse times. Stable topology yields stable layout regardless of selection or time edits. Keep edge selection accessible on mobile and keyboard.

## Directory & Structural Constraints

- `src/Editor.jsx`, `DraftField.jsx`, `EditorStationPicker.jsx`, `BatchEditor.jsx`, and `TransferGraph.jsx` coordinate user interactions.
- Keep reusable creation, normalization, direction matching, history, search, batch parsing/diffing, diagnostics, and graph-layout calculations in the corresponding `shared/editor-*`, `edge-fields.js`, and `transfer-graph.js` modules.
- Keep incomplete connection overlays out of `public/data/` and formal data supplied to `NetworkMap`/routing. Do not weaken the persisted schema to accept placeholders.

## Code Quality & Style Guidelines

- Use explicit object shapes and immutable candidate updates. Deep-copy inherited nested connection settings when creating a distinct edge.
- Validate before mutation; preserve data on errors, cancellations, no-op operations, and failed history recovery. Distinguish user-facing field errors from operational failures.
- Ensure blur, Enter, selection, and global actions cannot recursively submit one another or lose drafts.
- Preserve unknown/unlisted data within the operation's contract and enforce safe JSON/prototype-key constraints on history.
- Verify both domain transactions and actual browser input/file events; synthetic helper tests alone cannot prove draft recovery or DOM timing.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify the formal document, local drafts, derived views, and the exact user transaction being changed.
2. Specify completion, cancellation, independent field repair, navigation/export guards, and no-op behavior.
3. Check atomic Undo/Redo, unknown-field preservation, ID allocation, import compatibility, and stale kind-specific fields.
4. Test the completed, interrupted, invalid, cancelled, and replayed interaction in V2 fixtures and the browser.
