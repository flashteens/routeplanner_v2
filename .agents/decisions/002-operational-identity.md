# ADR 002: Operational Identity Is Not Display Identity

## Status and Scope

- Status: accepted; consolidated 2026-10-20 from the routing, through-running, transfer-graph, and arrival-field discussions.
- Scope: passenger state, transfer endpoints, vehicle changes, display overrides, and direction text.

## Decision and Rationale

- Preserve operational line/direction and onboard state independently of station ID and display color/name.
- Use arrival-direction transitions for same-vehicle continuation where departure and arrival states differ. Use explicit transfer edges and `countsAsTransfer` for actual vehicle changes, including those on one line.
- Preserve plain wildcard route IDs, direction-qualified IDs, and literal internal/external nodes. They have different meaning even when a graph layout can place them near one another.
- Display overrides may unify physical corridor presentation without changing routing identity. B1/L7 and loop/branch overlays require this separation.
- Keep direction labels optional and multilingual, scoped for bulk changes by actual route and direction across both forward/reverse slots.

## Rejected Alternatives

- Station-only shortest paths, color-based line merging, and automatically symmetric transfers.
- Merging wildcard and direction-specific transfer graph nodes because wildcard matching is allowed by the router.
- Restoring B1's removed tiny time penalty to approximate boarding restrictions.
- Reintroducing `arrivalDirectionLabel`/`reverseArrivalDirectionLabel` for field symmetry: arrival display text was reverted because those fields were not used by itinerary UI. Arrival codes and their illustrated help remain.
- Allowing stale ride fields on a transfer to alter list text or route results.

## Consequences and Exceptions

- Reverse operation, through-running, same-line vehicle changes, and alighting-only boarding need dedicated fixtures.
- Sharing or reversing schematic geometry does not establish reciprocal operational reachability.
- Adding a genuinely needed new display concept requires a user-visible consumer and a compatibility design, not an unused schema field.

## Directory & Structural Constraints

- Runtime semantics belong in `shared/router.js` and shared field normalization; editor direction operations belong in `shared/editor-directions.js`.
- Keep diagram help in `src/ArrivalDirectionField.jsx` and exact-node layout in `shared/transfer-graph.js`/`src/TransferGraph.jsx`.
- Follow [routing](../rules/routing.md) and [time and fares](../rules/time-and-fares.md); do not implement operational fixes in drawing code.

## Code Quality & Style Guidelines

- Name state transitions and fallback behavior explicitly. Preserve literal IDs, optional values, and imported safe legacy data.
- Keep schema validation separate from stricter editing requirements; do not mistake compatible historical data for permission to export an incomplete new edge.
- Validate behavior with synthetic states and actual route scenarios, not color or screenshot assertions alone.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify the operational state before departure, after arrival, and after any station transfer.
2. Check reverse reachability, wildcard matching, onboard restrictions, and actual vehicle-change counting.
3. Check displayed identity and multilingual text without using them as routing keys.
4. Run focused V2 routing/direction fixtures and editor graph/wording checks; document any intentional successor.

## Evidence and Supersession

- Evidence: `tests/roft.test.js`, `tests/editor-directions.test.js`, `tests/editor-upgrades.test.js`, and browser direction/arrival help verification.
- Sources: current `docs/data-format.md` and dated arrival-text reversion, exact-endpoint, and RoFT correction entries in `docs/verification.md`.
- The removed arrival-text design and historical B1 penalty are superseded; do not revive them from older commits without a new explicit decision.
