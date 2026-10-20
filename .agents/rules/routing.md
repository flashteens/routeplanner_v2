# Routing and Operational Identity

## Non-Negotiable Domain Rules

- Browser-side planning, the read-only API, and server-rendered route pages MUST use the shared routing semantics. Do not maintain independent approximate implementations.
- Passenger state includes station, operational line/direction, onboard status, and journey/transfer context. A station-only graph is insufficient.
- Preserve the existing ordered, nonnegative comparator model, including per-network tie-breaking. A visually plausible route with changed objectives is still a regression.
- `lineId` is operational identity. `displayLineId` and displayed direction text are presentation overrides; they must not determine whether a vehicle can continue or how direction-label bulk matching is scoped.
- `direction` is the departure direction requirement. `arrivalDirection` changes the state after travel without itself requiring a vehicle change. Reverse fields apply independently.
- Arrival codes are internal continuation state, not user-facing direction text. Do not recreate the reverted arrival-label fields merely for symmetry with direction labels.
- A transfer `L1 -> L2` allows any direction on the specified plain route. `L1:E` is direction-specific. Preserve literal internal/external IDs such as `#ZY_NJT.B1` and `#_DR_DR02`.
- Keep plain and direction-qualified nodes separate in the editor transfer graph. Matching a wildcard for routing or diagnostics does not authorize merging displayed nodes or inventing transfer edges.
- `ride`, `walk`, and same-station `transfer` have different field contracts. Transfer processing MUST ignore stale ride-only line, direction, arrival, boarding, display, and bend fields. Kind changes clean inappropriate fields atomically, with Undo support.
- Preserve one-way transfers and asymmetric time. Never infer a reverse journey solely from a shared drawn segment.
- `countsAsTransfer` can count a real vehicle change within a single operational line. Do not equate a transfer with a change of line ID.
- `boardingAllowed=false` prohibits boarding at that departure while allowing already-onboard through passengers. A station transfer clears onboard state and must not bypass this restriction.
- `variants` are ordered declarative conditions: use the first match; no match disables the edge. Preserve supported option profiles rather than evaluating configuration as code.

## Operational Cases That Must Remain Valid

- RoFT's numeric-nine-shaped L6 and YYL routes use arrival-direction changes for through-running; their consolidated IDs do not erase platform or direction distinctions.
- The special vehicle at CH changes the L6 journey order and counts as a transfer even within L6.
- B1 shares a displayed L7 section but has alighting-only constraints. Do not restore tiny timing penalties as a substitute for boarding logic.
- Loop branches can run directly into a main loop while the opposite journey requires a transfer. Reversed node sequences or shared display colors do not make operations symmetric.

## Directory & Structural Constraints

- Put search-state expansion, shortest-path semantics, and result construction in `shared/router.js` or narrowly scoped shared helpers.
- Put kind-specific field normalization in `shared/edge-fields.js` and schema/reference validation in `shared/network.js`.
- Keep UI-only validation in the editor layer or shared editor helpers when the portable schema intentionally accepts compatible historical data.
- Do not put routing policy in React event handlers, Express endpoints, CSS, or map geometry routines.

## Code Quality & Style Guidelines

- Use explicit fields and units. Define state transitions before optimizing or deduplicating them.
- Maintain finite, nonnegative costs and deterministic comparator order. Preserve the heap algorithm's correctness preconditions.
- Preserve safe imported-document compatibility, but ignore fields that are invalid for the edge kind instead of leaking them into itinerary text.
- Use synthetic networks to test direction continuation, same-line transfers, wildcard matching, reverse travel, and boarding restrictions independently of V1.
- Check `tests/roft.test.js`, `tests/routing.test.js`, and editor-upgrade tests when changing these rules.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify the exact passenger state before and after the affected connection, including onboard status and reverse travel.
2. Distinguish operational identity, wildcard matching, and display identity; check through-running and actual vehicle-change counting.
3. Check disabled service options, comparator tie-breaking, and portable old-document behavior.
4. Prove the change with focused V2 fixtures, then verify browser/API consistency and optional legacy parity where applicable.
