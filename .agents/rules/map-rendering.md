# Map Geometry, Placement, and Viewport Rules

## Non-Negotiable Domain Rules

- Distinguish game XYZ, schematic XY, and screen pixels. Game Y is altitude. Schematic Y corresponds to the horizontal game Z axis only when estimating a new station's position; existing authored layouts remain independent.
- Rendering corrections MUST NOT rewrite source station positions, game coordinates, mileage, service topology, or authored control points.
- Straight rendered segments must be horizontal, vertical, or exactly one of the two 45-degree diagonals. Rounded curves are the deliberate exception to constant straight-segment slope.
- Preserve rounded corners and stable parallel ordering through shared bends. Do not let parallel services cross at each shared node unless their actual paths diverge.
- Reversing the same node sequence must produce symmetric geometry. Keep loop-mainline and branch overlays consistent even when their traversal order is reversed.
- Shared-path detection must include express services that skip intermediate stations. An omitted stop does not imply a different underlying corridor.
- Generated octilinear bends and smoothing samples are derived geometry. Adding one user bend must add exactly one source control point, not persist all generated corners.
- Place station markers on the actual rounded paths. Shape coverage must include stopping lines and avoid implying a stop on bypassing services.
- Interchange stations may extend into capsules/rounded rectangles; mega stations retain a circular shape, may enlarge, and use a thicker outline. Limited-service stations retain their intended small shape/size rather than becoming huge to hide line-routing errors.
- Nonstopping lines bypass expanded markers with rounded, octilinear paths. Do not add an arbitrary diagonal or a V-shaped detour merely to connect a stopping line to the original marker center.
- Keep overlap gaps and minimum marker sizes usable at overview scale. A marker must not swallow nearby stations.
- Preserve eight-way station-name placement with normalized diagonal distance. At ordinary zoom levels labels must not be crowded by an all-or-nothing threshold: current M/I/L thresholds are 3/6/12; chosen, hovered, or edited stations and an explicit label toggle remain exceptions.
- Keep marker/label spacing expressed in appropriate screen units. Dragging a label must preserve its grab offset and write the discrete symbol direction rather than corrupt game coordinates.
- Selecting a sidebar station or ride/walk connection reveals it by panning at the current scale. Do not auto-fit or change zoom. If a whole path cannot fit, keep a point on the path near its midpoint visible; already-visible items should not move the viewport.
- Direct map dragging/selection must not trigger competing automatic recentering.

## New-Station Position Estimation

- Use existing anchors with game coordinates and map positions. Select neighbors using horizontal XZ distance; ignore altitude in this estimator.
- Fit game X to map X and game Z to map Y separately using positive local linear slopes. Extrapolate beyond anchors rather than averaging map positions back into their convex region.
- Current implementation uses up to five neighbors, inverse-distance-squared weights, and positive-scale fallback anchored at the nearest station when a local fit is degenerate or nonpositive. These are implementation choices supporting the orientation contract, not a ban on a validated replacement estimator.
- Exact horizontal anchor matches use the existing position; overlapping anchors are averaged. New rows must not become anchors for later rows in the same batch, and deleted stations must not participate.
- Missing coordinates or usable anchors fall back to the captured visible map center, with an explicit manual-check notice. Do not invent game coordinates from that screen position.
- Do not use horizontal-only placement distance for station search or route mileage, which retain three-dimensional XYZ semantics.

## Directory & Structural Constraints

- Keep pure geometry in `shared/map-geometry.js`, `shared/map-stations.js`, and `shared/station-symbol.js`.
- Keep placement/CSV coordination in `shared/editor-batch.js`; keep pure viewport movement in `shared/editor-focus.js`.
- `src/NetworkMap.jsx` owns SVG interaction and camera state, not operational routing policy or document migrations.
- Keep map references under `docs/` and rebuild helpers under `scripts/`. Reference layouts do not supersede newer authored JSON automatically.

## Code Quality & Style Guidelines

- Use explicit coordinate spaces and units in helper contracts. Reject or safely handle nonfinite/degenerate geometry; do not serialize NaN/Infinity or generated drawing state.
- Preserve reverse-path invariance and deterministic ordering. Separate shape/layout calculations from DOM gesture state.
- Test synthetic geometry and real reported relative-order cases. Do not freeze an author's editable station positions into absolute-coordinate assertions.
- Verify actual SVG straight segments, rounded stop placement, bypass coverage, desktop/mobile gestures, and camera dimensions; a source-anchor-only test cannot prove rendered geometry.
- Relevant suites include map-geometry, map-stations, editor-map, editor-batch, and editor-repairs tests, plus browser map-rendering verification.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Name the coordinate spaces and determine whether the change belongs to source data, a render-only projection, or camera state.
2. Check parallel ordering, reversed paths, stop/bypass membership, station types, rounded corners, and straight-segment slope constraints.
3. Check overview/mobile scale, label spacing, drag interactions, and unchanged persisted coordinates/control points.
4. Validate with synthetic properties, the reported case, and actual SVG/browser behavior; record the evidence without claiming a screenshot proves routing correctness.
