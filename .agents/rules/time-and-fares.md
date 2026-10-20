# Time, Distance, Familiarity, and Fare Semantics

## Non-Negotiable Domain Rules

- Ride base seconds equal departure-station dwell plus travel until the vehicle stops at the destination. Do not add destination dwell again.
- Walks and station transfers do not include train/cart dwell. TRTC journey estimates do not include waiting time; retain that notice in configurable footer translations.
- Keep reverse base time distinct when specified. Do not assume bidirectional operation means equal timing.
- Preserve conditional-time semantics: first matching `variants` entry wins; no matching entry disables the connection.
- A matching variant without `reverseTimeSec` inherits the connection's existing reverse timing, not automatically the variant's forward timing.
- Editing conditional timing to an empty list in the editor removes conditions. An untouched raw JSON `variants: []` remains a disabled connection. Preserve this distinction in no-op round trips.
- `delayWhenUnfamiliar` is the current persisted familiarity control. Apply the shared formula to each applicable forward/reverse/variant base time:
  - `seconds = base * (0.2 * coefficient + 0.8) + (5 / 3) * (coefficient - 1)`.
  - A 20-second base produces 20/37/54 seconds for coefficients 1/4/7.
  - A false flag preserves base timing. New transfers default true; new rides/walks default false. Existing delayed walks retain their explicit setting.
- Available coefficient values belong to the network. TRTC can use fractional coefficients; do not hardcode every system to 1/4/7.
- Continue reading old stored slopes for compatible downloads and history. Export normalization must be explicit, reversible, and must not erase variants or reinterpret it as a fixed-time edit.
- Minecraft distance is an estimate: `round(hypot(dx, dy, dz)) / 1000` km with one block equal to one metre. Missing XYZ, station transfers, and outside-station walks use zero under the current contract.
- Coordinate search also uses three-dimensional proximity. Do not apply the horizontal-only station-placement fix to search or mileage.
- Map XY and screen pixels are not physical distance. Moving a station on the schematic must not recalculate mileage.
- Display flags control which metrics appear; they do not remove API vectors. Current configuration, not a stale README table, determines whether distance/fare is shown.
- TRTC total fare comes from the origin-destination matrix, not a sum of adjacent-segment fares. Preserve the 20-minute external-transfer rule and separated paid journeys when exceeded.
- Preserve unavailable fares as unavailable/null; do not claim they are free. Minecraft systems currently use free fares.
- External fare/map references describe a bounded dataset, not permission to add newly listed stations or live runtime fetches.

## Directory & Structural Constraints

- Keep the familiarity formula and compatibility in `shared/familiarity.js`, routing timing selection in `shared/router.js`, and output units in shared formatting/presentation helpers.
- Keep fare source data and retrieval metadata in the existing data/reference files. Runtime calculations must work offline.
- Keep the TRTC matrix and external-transfer configuration in the network's `fares` document. Do not hide fare tables inside React components.

## Code Quality & Style Guidelines

- Reject nonfinite numeric inputs and negative cost/time/distance/fare values at document and URL boundaries. Signed game/map coordinates and declared option codes such as express level `-1` remain valid. Specify fallback behavior for absent reverse/variant values.
- Preserve deliberate precision and approved V2 corrections; do not round to force legacy equality.
- Use synthetic forward/reverse and option-profile cases for numeric behavior. Check total route objectives and transfer timing as well as individual edge expansion.
- Document the source and scope of a fare update. Do not silently refresh external data during a UI change.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify the quantity, unit, dwell boundary, and whether the value is forward, reverse, variant, or displayed-only.
2. Check familiarity and option fallbacks, including false flags, fractional coefficients, and no-match behavior.
3. Separate game XYZ calculations, schematic placement, standalone segment prices, and complete-journey fares.
4. Validate focused numeric cases and supported network profiles; document any approved deviation from V1.
