# ADR 004: Derived Geometry Preserves Authored Data and Horizontal Orientation

## Status and Scope

- Status: accepted; consolidated 2026-10-20 from parallel-curve, station-marker, reversed-loop, mobile-map, and k-NN repair decisions.
- Scope: rendering-only correction, source control points, coordinate inference, and selected-item camera movement.

## Decision and Rationale

- Solve drawing problems in derived geometry without increasing the editor JSON schema or rewriting authored anchors.
- Keep stable shared-path ordering, reverse-sequence symmetry, rounded corners, octilinear straight segments, and accurate stopping/bypassing membership.
- Adapt interchange/mega marker shapes to stopping lines while retaining the limited-service marker contract.
- Infer new station placement using horizontal XZ neighbors and separate positive local X-to-X/Z-to-Y fits, with explicit fallback. Do not use altitude or convex position averaging for this estimate.
- Reveal sidebar selections by panning at fixed zoom, keeping a point on oversized paths visible. Do not make direct map dragging compete with automatic recentering.

## Rejected Alternatives

- Persisting generated curve samples, routing detours, marker corrections, or every generated 45-degree bend as user control points.
- Expanding small station markers to hide disconnected line rendering, introducing arbitrary slopes, or forcing a V-shaped stop detour.
- Assuming a reversed loop-branch node sequence can use direction-dependent geometry and still align with the mainline.
- Original 3D inverse-distance position averaging: T01/T02/T03 moved left as game X increased because the nearest anchor's weight fell. It also incorrectly included altitude.
- Extending the placement fix to remove game Y from search or mileage, where 3D distance remains intentional.
- Refitting zoom whenever a selection changes, which disorients users and breaks their editing context.

## Consequences and Exceptions

- Visual correctness needs actual SVG/browser checks and semantic stop membership, not only anchor-coordinate assertions.
- The estimator is a local approximation; authored positions remain editable. Do not freeze incidental absolute positions in regression tests.
- Rounded curves intentionally vary slope; the four allowed orientations constrain straight rendered segments.
- Batch estimates use pre-existing retained anchors, so row order and newly inserted rows do not influence later estimates.

## Directory & Structural Constraints

- Geometry and markers belong in `shared/map-geometry.js`, `shared/map-stations.js`, and `shared/station-symbol.js`.
- Placement belongs in `shared/editor-batch.js`; pure viewport revealing in `shared/editor-focus.js`; gestures and SVG DOM state in `src/NetworkMap.jsx`.
- Follow [map rendering](../rules/map-rendering.md) and [time/distance semantics](../rules/time-and-fares.md). Do not put operational pathfinding in these modules.

## Code Quality & Style Guidelines

- Explicitly identify coordinate spaces, units, degenerate inputs, and positive-scale fallback behavior.
- Preserve deterministic topology-based geometry and source-data immutability. Avoid NaN/Infinity in drawing or serialized values.
- Test synthetic linear/extrapolation cases, reverse-path properties, the reported real relative-order case, mobile gestures, and unchanged camera dimensions.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Separate source anchors/game coordinates from derived paths/markers and screen/camera state.
2. Check reversed shared geometry, parallel curves, station types, stop coverage, and bypass slopes.
3. Check placement orientation, altitude independence, degenerate anchors, and fixed-scale navigation.
4. Verify unit properties and actual SVG/mobile behavior while confirming no unintended JSON topology/coordinate changes.

## Evidence and Supersession

- Evidence: map-geometry, map-stations, editor-map, editor-batch, and editor-repairs tests and browser scenarios.
- Sources: current `docs/data-format.md` and the rendering/placement repair records in `docs/verification.md`.
- The earlier position-average estimator is superseded. Its historical verification paragraph is not the current implementation contract.
