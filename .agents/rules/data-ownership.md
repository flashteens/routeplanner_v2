# Data Ownership, Compatibility, and Publication

## Non-Negotiable Domain Rules

- V2 is the public repository. A contributor MUST be able to run V2 and its owned quality checks without access to private V1 source or the owner's filesystem.
- Published networks in `public/data/` are author-maintained documents, not disposable build products. Inspect Git state and preserve manual updates before editing anything.
- Runtime code MUST NOT require PHP, `LEGACY_ROOT`, private notes, a database, an API key, or live third-party downloads to calculate a cached route.
- Treat V1, supplied images, and external reference documents as read-only optional evidence. Do not copy private legacy source into the public repository to bypass a missing comparison input.
- Resolve optional legacy sources through `LEGACY_ROOT` or the documented fallback. Never hardcode a workstation's absolute path as a project requirement.
- Do not run migration or locale regeneration incidentally. Inspect the generator, current outputs, expected overwrite scope, and proposed diff first. Run destructive regeneration only within explicitly authorized work, with a recoverable baseline.
- `scripts/locales.js` currently predates several maintained translation additions. Do not assume running it preserves the current dictionaries. A future generator reconciliation must preserve all supported keys and wording.
- Do not add stations or services merely because they appear in a newer map reference. Route times, topology, direction states, and fares require a deliberate data update.
- Official map labels and authored station layouts can evolve. Do not restore an older layout solely because a screenshot, migration fixture, or old assertion uses it.
- Preserve old downloaded schema-v2 documents and safe history snapshots where compatibility is implemented, including legacy label placement and stored familiarity slopes.
- Do not increment the schema or add fields merely to fix rendering. A necessary schema change requires an explicit compatibility/migration design.

## Approved Differences Are Not Regressions

- RoFT L6/L6N and YYL/YYL2 consolidation, special same-line vehicle changes, B1 boarding restrictions, and branch through-running are deliberate operational rules. See [routing](routing.md).
- Deliberate RoFT millisecond-scale differences must not be rounded away without understanding their purpose. Do not reintroduce the removed B1 timing workaround.
- TRTC outside-station walks BL07/Y16 and BL08/Y17 deliberately exclude V1's erroneous 30-second cart dwell; their approved base seconds are 600 and 360.
- Author-adjusted station positions, label directions, route bends, preview additions, and the preview HEC-to-WS05 timing correction are intentional data maintenance. For the latter, the approved base time is 27.5 seconds.
- V1 parity applies only where behavior was not explicitly corrected. Preserve the documented comparison exclusions and add focused V2 tests for corrected behavior.
- NR, obsolete preview authentication/signout, legacy analytics/comments, and unreachable legacy tools were intentionally excluded. Do not restore them because a file exists in V1.

## Directory & Structural Constraints

- Keep published network documents and system selection metadata in `public/data/`; keep current schema documentation in `docs/data-format.md`.
- Keep legacy loading, PHP/JavaScript extraction, and migration references in `scripts/`. They must not enter runtime bundles.
- Keep public decision rationale in `.agents/decisions/`. Keep machine paths and personal tool setup outside tracked shared rules.
- Keep runtime versions and scripts in package/build configuration; preserve Node.js 22.12+ and Docker support.

## Code Quality & Style Guidelines

- Use UTF-8 JSON with explicit named fields and units. Preserve document IDs, optional values, unrelated languages, and unlisted fields according to the edit operation.
- Validate references and schema before committing a document mutation. Never repair an invalid test by silently changing authoritative data.
- Treat `docs/verification.md` as chronological evidence. Its older descriptions, test counts, and hash baselines do not override later approved decisions.
- Hash audits MUST exclude legacy `.git/`. Investigate a mismatch; do not regenerate a baseline to hide a write. An independently committed, pre-task author update can justify a narrowly documented baseline adjustment.

## Contributor Identity and Local-Only Workflow

- Use local edits and local commits. Do not push, trigger deployment, remotely merge, or publish without explicit task-specific authorization.
- Use the current contributor's approved author and committer identity. `FlashTeens` is the owner's identity, not a mandatory identity for other contributors. The originating owner session explicitly required that identity; do not infer an employer name instead.
- A local commit is not a deployment. Render tracks `main`; pushing can publish code automatically.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify whether the input is published V2 data, an optional reference, a generated output, or local-only context.
2. Check existing user changes, compatibility obligations, and approved V1/V2 differences before deriving a replacement.
3. Confirm authorization for regeneration, data publication, or destructive scope; do not infer it from an unrelated UI task.
4. Review the exact data diff and report independent V2 verification separately from available V1 comparisons.
