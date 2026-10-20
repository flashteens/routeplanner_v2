# Language, Presentation, Mobile, and Offline Operation

## Non-Negotiable Domain Rules

- Support English, Traditional Chinese, and Japanese UI text. `zh-TW` is accepted as a language alias. Keep all supported dictionaries complete when adding a user-facing action or error.
- Station/line names are network data, separate from interface translations. Japanese interface names currently fall back to the original English names; do not replace official English/Chinese names with machine translations.
- Preserve additional imported language keys during edits and direction-label bulk operations. A two-language default form is not permission to delete other languages.
- Use plain user-facing wording such as connection, route number, and separate transfer groups. Do not expose implementation terms such as graph components or edge IDs as product explanations.
- Clearly distinguish through-running without a vehicle change from a station transfer/walk. UI, copied itinerary text, API formatting, and readable HTML must remain consistent.
- Keep configurable footer descriptions, primary map/official-site links, RoFT world-download links, and unofficial labeling for TRTC/Newisle. Do not imply the author owns those third-party systems.
- New controls and help must work with keyboard and touch, not hover alone. Preserve native pinch zoom, midpoint anchoring, usable touch targets, and mobile bounds.
- Help popovers must be readable, dismissible, and localized. Long technical explanations may link to deployed `public/docs/` content; reading help must not alter the document or history.
- Production offline operation must retain shell assets, all UI languages, a lightweight system catalog, and exactly one active network JSON. Network switching and multiple tabs must respect the shared single-network cache policy.
- Do not silently preload/retain every network. A not-yet-cached system requires an online load; imported editor documents are not automatic durable storage.
- Interactive search and routing are local after loading data. Do not turn ordinary planner actions into mandatory calculation-API calls.
- Preserve server-readable initial route content, escaped output and JSON-LD, public read-only GET/CORS API behavior, and explicit validation of system/query IDs.
- Render imported legacy station HTML only through the existing isolated sandbox; do not execute its inline scripts or replace it with unsandboxed HTML insertion.

## Cache and Generator Cautions

- Build production assets before testing offline behavior. Development mode intentionally does not run the production service worker.
- Review `public/sw.js` versioning whenever changing cached behavior/assets. Verify fresh load, an existing cache update, and offline reload where affected.
- Do not assume a server-side version replacement automatically covers the current service-worker version string. Inspect the actual replacement and emitted response; a historical exact-string replacement has drifted from the manually incremented version.
- `scripts/locales.js` is a legacy generator and may overwrite newer dictionary content. Do not run it until its output coverage has been reconciled explicitly.

## Directory & Structural Constraints

- Store interface translations in `public/i18n/{en,zh,ja}.json`, names and configurable content in the network document, and shared wording in formatting/presentation helpers.
- Keep language/system switching, local loading, preview, and undownloaded-state coordination in `src/main.jsx`.
- Keep cache lifecycle in `public/sw.js` and server asset delivery in `server/index.js`; do not put cache policy in routing calculations.
- Keep standalone deployed help under `public/docs/`. Repository-only `docs/` paths are not automatically public help URLs.

## Code Quality & Style Guidelines

- Use translation keys and parameters, not concatenated language-specific business explanations. Preserve independent name fallback behavior.
- Validate URL/network inputs and escape server-rendered text/structured data. Keep CORS restricted to the intended public read-only surface; do not add authenticated/editor mutation routes casually.
- Make loading, invalid-input, offline-unavailable, copy/download failure, and no-route states understandable without modifying source data to suppress errors.
- Test mobile overflow, keyboard/touch help, file operations, cache eviction, and browser/API/text consistency. Do not count a successful online render as offline verification.

## Pre-Change Architecture Checkpoints (CoT Workflow)

1. Identify whether text belongs to UI translations, authored network names, configurable descriptions, or operational itinerary formatting.
2. Check the same action on desktop, touch, keyboard, and readable server output; preserve document state when only presentation changes.
3. Check shell/network cache scope, service-worker version behavior, and online/offline failure paths.
4. Verify supported languages, actual mobile bounds, output escaping, and the affected production cache lifecycle.
