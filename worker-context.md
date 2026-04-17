# VUHL UI Forge Worker Context

Canonical repo: `C:\dev\Screenshot-To-Code`

Product:
- `VUHL UI Forge` is the unified repo for the standalone web app plus MCP-driven workflow.
- `frontend/` is the browser UI.
- `backend/` is the FastAPI generation engine.
- `mcp/` should become the MCP orchestration layer; it is currently scaffold-only unless otherwise stated in repo files.

Current state:
- Backend session APIs now exist under `backend/routes/sessions.py` with storage in `backend/sessions/`.
- `backend/routes/generate_code.py` now accepts optional `sessionId` and records generated variants into sessions.
- Frontend has partial session-aware plumbing under:
  - `frontend/src/hooks/useSession.ts`
  - `frontend/src/lib/session-api.ts`
  - `frontend/src/store/session-store.ts`
  - `frontend/src/App.tsx`
- The standalone web app still needs to remain functional when no session is present.
- The MCP/browser round-trip is not complete until the browser can mark an approved variant and the MCP layer can return design results from the unified repo.

Constraints:
- Prefer additive changes that keep upstream mergeability healthy.
- Do not rewrite the core upstream app architecture unless needed.
- Do not create extra in-repo markdown docs beyond `README.md`, `AGENTS.md`, and `CLAUDE.md`.
- Keep README product-focused; remote-placement details belong in Obsidian, not the README.
- Do not do git commits or pushes unless explicitly asked in the task prompt.

Verification defaults:
- Backend: worker evidence already showed `poetry run pytest` and `poetry run pyright` passing for the backend session changes.
- Frontend: use `corepack yarn eslint ...` for targeted lint and `corepack yarn test --runInBand`.
- Full frontend lint currently has pre-existing upstream issues outside the new session files; do not treat those unrelated failures as blockers for session-specific work.

---

## Round 2 plan (screenshot-to-implementation pipeline)

The vision is a seamless path from "user provides text + screenshot" to "implementer agent integrates into the target project in a framework-idiomatic way, reusing existing CSS/components." The repo has the generation engine, session APIs, and a partial MCP surface. The next round builds the missing middle: project-aware context ingestion, pattern-annotated specs, refinement on selected variants, and a framework-aware conversion step (starting with Angular).

Quality bar: professional, usable, seamless, frictionless, maintainable, readable, stable, elegant. Spot-check viability while coding; do not start servers. Verify via unit tests, type checkers, and lint only.

### Track A — Backend + MCP tooling (Claude)

Owns: `mcp/src/**`, `backend/routes/sessions.py` (additive), `backend/sessions/**` (additive), any new `backend/spec/**` or `backend/context/**`, plus colocated tests.

Deliverables:

1. `gather_project_context` MCP tool + backend endpoint. Scans a target repo path and extracts:
   - framework + version (Angular vs React vs Vue vs plain HTML), inferred from `package.json` / `angular.json` / `tsconfig.json`;
   - component inventory (public components with their selectors/names, constructor-or-input signatures);
   - CSS tokens (Tailwind config values, CSS custom properties, SCSS variables, design tokens where detected);
   - pattern signals (signals vs observables vs hooks vs plain state; RxJS presence; standalone vs NgModule Angular; zoneless hints);
   - conventions summary (naming, folder layout, common imports, HTML-only vs framework template style).
   Store under `provide_context` with `context_type = "project"` so the existing frontend can surface it.

2. `extract_design_spec` MCP tool + backend endpoint. Given `sessionId` + selected variant, produce a dual-format spec:
   - a structured JSON payload (component tree, tokens, bindings, functional behavior, reusable-component suggestions keyed to the ingested project context);
   - an annotated markdown companion whose body is a handoff prompt for an implementer agent. The markdown must include explicit "Align with project patterns" reminders keyed to the gathered context: e.g. "This project uses Angular signals; model the list as a `signal<Item[]>`, not an RxJS stream." and "This project defines a reusable `<app-card>`; prefer it over re-creating the outer container."
   - The spec should also flag places where generic HTML maps cleanly onto existing components (by name) and places where new components would need to be added.

3. `refine_variant` MCP tool + backend endpoint. Given `sessionId` + variant index + optional text + optional image, queue a refinement pass that streams back into the same variant slot. Reuse the existing WebSocket pipeline; do not invent a second streaming channel.

4. Unit tests for:
   - the project-context scanner (fixture repos in `backend/tests/fixtures/project_context/`);
   - the spec extractor (golden JSON + annotated markdown against a small fixture HTML variant);
   - the new session route/service methods.

5. MCP-side test(s) for tool registration wiring (mock the backend client).

Verification: `cd backend && poetry run pytest` and `cd backend && poetry run pyright` must both pass clean on changed files. For MCP: `cd mcp && corepack yarn tsc --noEmit` must be clean.

Non-goals for Track A:
- Do not modify `frontend/**`.
- Do not modify `backend/routes/generate_code.py`.
- Do not add a second streaming transport.
- Do not auto-commit or push.

### Track B — Frontend UX + HTML→Angular bridge (Codex)

Owns: `frontend/src/components/variants/**`, `frontend/src/components/preview/**`, new `frontend/src/features/**` folders as needed, `frontend/src/lib/**` for pure utilities, `frontend/src/store/session-store.ts` for additive state only.

Deliverables:

1. Variant gallery polish for 4-up streaming comparison. Make the active-variant indicator and per-variant model label first-class. When `sessionId` is present and context includes a selected model set, surface the model name next to each tile.

2. "Iterate on selected variant" UX. Once the user picks a variant:
   - show a tight secondary input pane (text + optional image) under the selected preview;
   - submit re-runs as a refinement pass that updates the same variant tile in place (hook into whatever streaming path exists; do not create a parallel one);
   - keep the previous version visible as a "before" for a quick diff-style glance.
   The interaction should feel native, not modal.

3. Per-variant model switcher at the top of the variant grid: let the user re-run the grid with a different model selection for A/B comparison. Read supported models from the existing variant model registry (do not hardcode).

4. Pure HTML→Angular template converter in `frontend/src/lib/angular-convert/`:
   - input: HTML string (Tailwind-friendly);
   - output: `{ template: string, componentTs: string, imports: string[] }`;
   - heuristic rules: lists with repeated structure → `@for`, conditional blocks → `@if`, `onclick=`/`onchange=` → `(click)`/`(change)`, ARIA attributes preserved, Tailwind classes preserved verbatim;
   - a small "Copy as Angular" affordance on the selected variant that calls the converter and puts the result on the clipboard. No server roundtrip.

5. Unit tests (vitest or jest, whichever the repo already uses):
   - pure converter tests with golden input/output fixtures;
   - component tests for the iteration pane reducer/state logic (not full rendering, just the pure state transitions).

Verification: `cd frontend && corepack yarn lint` clean on changed files. `cd frontend && corepack yarn test --runInBand` green. `cd frontend && corepack yarn tsc --noEmit` clean on changed files.

Non-goals for Track B:
- Do not touch `backend/**`.
- Do not touch `mcp/**`.
- Do not change `App.tsx` except as strictly necessary to mount the new iteration feature; if mounting is needed, keep the diff to <20 lines.
- Do not auto-commit or push.

### Shared rules for Round 2

- Read `README.md`, `AGENTS.md`, `CLAUDE.md`, and this file first.
- Do not start the backend server or the frontend dev server; rely on unit tests, type checking, and lint for viability.
- Leave a short "Round 2 results" section at the bottom of this file at the end of the run, noting what landed, what was skipped, and any pre-existing unrelated failures you chose not to fix.
- Do not create new markdown docs anywhere in the repo. Update README only for a user-visible surface change (e.g. a new MCP tool name) and keep the edit minimal.
- Do not rewrite the upstream engine shape; keep changes additive.

## Round 2 Track B results

Status: landed. All five deliverables implemented, verified via lint + tsc + jest. Zero new top-level deps. No backend, mcp, app-store, or project-store edits. `App.tsx` diff capped at 5 added lines (well under the 20-line budget).

### Files added

- `frontend/src/lib/angular-convert/index.ts` — pure HTML→Angular converter. Public API `convertHtmlToAngular(html, options?) => { template, componentTs, imports }`. Custom tokenizer + recursive-descent parser (no new deps). Heuristics: `list-to-for` (siblings with the same tag + class signature → `@for (item of items; track $index)`), `data-if-to-if` (`data-if="expr"` → `@if (expr) { ... }`), `onclick-to-click`, `onchange-to-change`, `oninput-to-input`. ARIA and `data-*` attributes passed through. Tailwind class strings emitted verbatim. Emits a banner comment at the top of `componentTs` listing the heuristics that fired (or a "no heuristics fired" note).
- `frontend/src/lib/angular-convert/index.test.ts` — 6 golden tests.
- `frontend/src/features/iterate/iterateReducer.ts` — pure reducer + action types + `canSubmit`/`hasBeforeAfter` selectors. Caps attached images at `MAX_ITERATE_IMAGES = 5`. `submit` without text or images transitions to `status="error"`. `complete` is a no-op unless status is `"submitting"`.
- `frontend/src/features/iterate/iterateReducer.test.ts` — 10 state-transition tests.
- `frontend/src/features/iterate/bridge.ts` — module-level registry for `doUpdate` and `regenerate` closures owned by `App.tsx`. Lets feature components invoke the WebSocket update/regenerate paths without prop-drilling through `Sidebar`.
- `frontend/src/features/iterate/iterateStore.ts` — zustand store for the "before" snapshot (code, variant index, model, source commit hash) and the pane's `isExpanded` flag. Survives the commit-change re-render so the before thumbnail persists when the refinement commit lands.
- `frontend/src/features/iterate/IteratePane.tsx` — collapsed-by-default secondary pane that sits directly under the selected variant when it is complete. Textarea for refinement text + image-chip row + submit arrow. `handleSubmit` captures the before snapshot, writes `updateInstruction` / `updateImages` into `app-store`, then calls `getIterateActions().doUpdate(text)`. When a new commit lands after submit, a `useEffect` dispatches `complete` so the reducer snapshots the after-code for the before/after view.
- `frontend/src/features/model-switcher/ModelSwitcher.tsx` — dedupes models from the `variantModels` registry; renders one chip per unique model (violet for the active variant's model) and a "Re-run grid" button that invokes `getIterateActions().regenerate()` for an A/B re-run. Returns null until at least one model is known. No hardcoded model list.
- `frontend/src/features/angular-copy/CopyAsAngularButton.tsx` — invokes the converter and writes `componentTs + "\n<!-- angular-convert template preview -->\n" + template` to the clipboard via the existing `copy-to-clipboard` dep. Compact (icon-only) and full (labeled pill) modes. Toasts on empty code or conversion failure. Flashes "Copied" for 1500 ms on success.

### Files modified

- `frontend/src/App.tsx` — 5 added lines: import `registerIterateActions` and a parameter-less `useEffect` that registers the current `doUpdate` / `regenerate` closures on every render so the bridge always points at the freshest closures.
- `frontend/src/components/variants/Variants.tsx` — mounts `<ModelSwitcher>` above the 2-column grid; adds the active-variant `Active` badge with `data-testid="active-variant-indicator"` and a violet ring on the selected tile; adds the per-variant model label pill with `data-testid="variant-model-label"` shown when `sessionId !== null || variantModels.some(Boolean)`; renders `<CopyAsAngularButton>` + `<IteratePane>` under the grid when the selected variant is complete; `handleVariantClick` calls `setExpanded(true)` to auto-open the iterate pane.
- `frontend/src/components/preview/PreviewPane.tsx` — renders the compact `CopyAsAngularButton` in the right-side action row (before the Download button) when `settings.generatedCodeConfig` is `Stack.HTML_TAILWIND` or `Stack.HTML_CSS` and `previewCode.trim().length > 0`.

### Tests added

- 6 converter tests: button w/ onclick → `(click)` + stub method; plain list → `@for` + data field; `data-if` → `@if`; input w/ onchange → `(change)`; signals mode emits `signal(false)`; non-list siblings untouched.
- 10 reducer tests: initial state, `setText`, `addImages` caps at 5, `removeImage`, `clearImages`, `reset`, `submit` happy path captures `beforeCode`, `submit` without text/images sets `status="error"`, `complete` sets `afterCode`, `complete` is ignored unless status is `submitting`, `fail` sets error message.

Total: **16 new tests, all passing**.

### Verification

- `cd frontend && corepack yarn tsc --noEmit` → clean. 0 errors.
- `cd frontend && corepack yarn lint` → clean. 0 warnings, 0 errors.
- `cd frontend && corepack yarn test --runInBand` → **35 passed, 6 skipped** (pre-existing qa e2e suite skipped under jest), 0 failed. 7 suites total.
- `git diff --stat` confirms the frontend diff is contained to the files listed above. No backend/mcp/store changes.

### Deferred / limitations

- **True per-variant model override is deferred.** The existing `/generate-code` WebSocket pipeline picks variant models from server-side sets (`ALL_KEYS_MODELS_DEFAULT` and friends) and ignores the `codeGenerationModel` setting at the socket layer. The shipped `ModelSwitcher` therefore surfaces the models the registry actually reports and offers a "Re-run grid" for an A/B comparison rather than pretending to override. Making per-variant override real requires a small backend change (accept per-variant model selection through the existing pipeline) that is out of Track B's ownership scope.
- **Before/after comparison view is minimal.** The `IteratePane` persists the before snapshot and dispatches `complete` with the after-code when the next commit lands, but currently renders only the "before" thumbnail next to the textarea; a side-by-side after-thumbnail/diff view can be added without reducer changes when the UX calls for it.
- No other items deferred.

---

## Round 2 Track A results (backend + MCP tooling)

### Files added

- `backend/context/__init__.py`, `backend/context/models.py`, `backend/context/scanner.py` — project-context scanner. Detects framework (Angular / React / Vue / Svelte / plain HTML / Python / unknown) via `package.json` / `angular.json` / `tsconfig.json` / `pyproject.toml`, inventories components with selectors and inputs/props, extracts Tailwind config colors + spacing, CSS custom properties, SCSS variables. Regex-based (not AST) to stay self-contained and fast. Honors a file-count budget (`max_files`, default 400) and truncates with a warning when hit.
- `backend/spec/__init__.py`, `backend/spec/models.py`, `backend/spec/extractor.py` — HTML variant → structured `DesignSpec` + annotated markdown handoff. Walks the BeautifulSoup tree, collects tokens / event bindings / state hints, matches elements to known components (selector / keyword), emits framework-specific alignment notes (Angular: signals, standalone, `@for`, `--color-*`; React: hooks + Props types; Vue: `<script setup>` / `defineProps`). Writes implementer-ready markdown.
- `mcp/src/server/tools.ts` — extracted tool definitions into a typed `McpToolDefinition` array with `ToolContext` carrying `getSessionUiUrl`, plus a `validateToolArgs` helper that tests hit directly. 10 tools total (7 pre-existing + 3 new).
- `mcp/src/server/tools.test.ts` — 16 unit tests for tool registration + argument validation + handler behaviour (mock `globalThis.fetch`, assert snake_case request bodies to backend).
- `backend/tests/test_project_context_scanner.py` — 6 scanner tests (angular_signals, react_hooks, vue_composition, plain_html, max_files truncation, missing path error).
- `backend/tests/test_design_spec_extractor.py` — 3 extractor tests (with project context → `CardComponent` reuse + signals/standalone/@for notes; without context → fallback reminders; golden shape).
- `backend/tests/test_sessions_round2_api.py` — 8 route tests covering gather/extract/refine happy-path, validation 400/422, and 404.
- `backend/tests/fixtures/project_context/{angular_signals,react_hooks,vue_composition,plain_html}/` — four minimal fixture repos used by both scanner tests and the API tests.

### Files modified

- `backend/sessions/schemas.py` — added `GatherProjectContextRequest` / `Response`, `ExtractDesignSpecRequest` (model_validator requires `variant_id` or `variant_index`) / `Response`, `RefineVariantRequest` (model_validator requires `text` or `image_data_url`) / `Response`.
- `backend/sessions/service.py` — added `queue_refinement(...)` that persists a `context_type="refinement_queue"` record containing a fresh `refinement_id`, `variant_index`, `text`, `image_data_url`, and `status="queued"`. No new tables, no second streaming channel.
- `backend/routes/sessions.py` — three additive endpoints: `POST /sessions/{id}/context/project`, `POST /sessions/{id}/spec`, `POST /sessions/{id}/refine`. Added `_pick_variant` helper (prefers most-recent when `variant_index` has multiple matches) and `_latest_project_context` helper (reads latest `context_type="project"` record, parses into `ProjectContext`). `/refine` returns a `stream_hint` pointing back at the existing `/generate-code` WebSocket endpoint — the refinement is drained by reusing the same pipeline with `generationType='update'`.
- `mcp/src/server/backend-client.ts` — added 6 interfaces and 3 async client functions (`gatherProjectContext`, `extractDesignSpec`, `refineVariant`) that translate camelCase tool args into snake_case backend JSON.
- `mcp/src/server/index.ts` — switched from inline `server.tool(...)` calls to iterating `toolDefinitions` from `./tools.js`. `/health` now reports `toolNames`.
- `mcp/tsconfig.server.json` — excluded `src/server/**/*.test.ts` from the server build so tests aren't emitted into `dist/`.
- `mcp/package.json` — added `test` script: `node --import tsx --test src/server/tools.test.ts`.

### MCP tools added

- `gather_project_context { sessionId, repoPath, maxFiles?, maxComponents?, label? }` → persists a `context_type="project"` record with the scanner output; returns `{ context, projectContext }`.
- `extract_design_spec { sessionId, variantIndex?, variantId?, persistAsContext? }` → requires at least one variant identifier; reads latest `project` context if present; optionally persists the spec as `context_type="design_spec"`; returns `{ spec, annotated_markdown, context_record, ... }`.
- `refine_variant { sessionId, variantIndex, text?, imageDataUrl? }` → requires at least one of text/image; enqueues the refinement via `SessionService.queue_refinement`; returns a `stream_hint` telling the caller to drive the existing `/generate-code` WebSocket.

### Off-limits boundaries respected

- No edits to `frontend/**`, `backend/routes/generate_code.py`, or the WebSocket pipeline. The refinement queue is consumed by the unchanged `/generate-code` flow — the `stream_hint` tells callers (or a future frontend stub) how to drain it without introducing a new streaming channel.

### Verification

- `cd backend && poetry run pytest` → **132 passed** in 5s (17 new + 115 pre-existing). No skips, no failures.
- `cd backend && poetry run pyright` → 0 errors, **30 warnings** total. Pre-task baseline was 53; dropped to 30 by cleaning Pydantic factory typing and narrowing BeautifulSoup casts. Changed files (`backend/context/**`, `backend/spec/**`, `backend/routes/sessions.py`, `backend/sessions/{schemas,service}.py`, the three new test files) are pyright-clean — 0 warnings on the delta.
- `cd mcp && npx tsc --noEmit -p tsconfig.server.json` → clean.
- `cd mcp && node --import tsx --test src/server/tools.test.ts` → **16 passed, 0 failed** across 5 suites.

### Deferred / limitations

- **Root `tsc --noEmit` in `mcp/`** still reports `TS6306: Referenced project 'tsconfig.server.json' must have setting "composite": true`. This is a pre-existing repo-config issue (reproduces at `HEAD` without any Track A changes) and is outside the additive scope of Track A. The targeted invocation (`tsc --noEmit -p tsconfig.server.json`) is clean and is what CI should run for server code.
- **Frontend integration of refinement + design-spec handoff is not wired.** Track A delivers the backend + MCP surface; a future Track (or Track B extension) needs to call `gather_project_context` / `extract_design_spec` from the frontend and consume `refine_variant`'s `stream_hint` to drive the existing WebSocket with `generationType='update'`.
- **Scanner is regex-based, not AST-based.** Intentional trade-off for self-containment and speed. Trade-offs documented in the module docstring; obvious misses (e.g. dynamic selectors assembled at runtime) fall back to the unknown bucket and don't crash the scan.
- **No fingerprinting of framework minor versions beyond what `package.json` reports.** Angular 17 vs 18 vs 19 is reported as-is from the pinned/resolved version string; no heuristic "treat 16+ as signals-capable" override. The alignment notes already key off `patterns.uses_signals` which is detected directly from code (`input()`, `signal()`, `computed()` usage), not from the version.

---

## Round 5 plan — Implementer handoff bundle

Vision anchor (verbatim from user): "there's this seamless, super fast way to take a screenshot mockup and turn it into a reality." The existing pipeline already covers screenshot + text → 4 variants → iterate → design spec. The last-mile gap is: the implementing agent (Claude / Codex) should receive a single self-contained document that bundles everything it needs — no glue work, no screen scraping, no guessing.

Scope: frontend composition + MCP tool. No backend endpoint changes (the spec + context records already exist). No model picker yet (deferred — needs backend overrides on `/generate-code`).

### Track F — Frontend implementer handoff

Owns: `frontend/src/features/implementer-handoff/**`, small wire-up in `frontend/src/components/variants/Variants.tsx`.

Deliverables:

1. `features/implementer-handoff/composeHandoff.ts` — pure function `composeHandoff({ variantIndex, variantCode, variantModel, specResult, projectContextSummary, angularConversion })` that returns a single markdown document. Sections:
   - Title + at-a-glance metadata (variant number, model, framework, generated-at).
   - Summary + implementer goal (verbatim: "integrate this design into the existing project without regressing component reuse, design tokens, or framework idioms").
   - Project context block (framework, state style, component count, token count, folder layout, naming conventions) — only when project context is available; otherwise a compact "No project scan attached; ask the user for it."
   - Alignment notes (from `specResult.spec.alignmentNotes`, one bullet each).
   - Reuse candidates (name, selector, file, confidence, rationale) — exactly as the backend emitted them.
   - New components likely needed.
   - Variant HTML (fenced `html` block).
   - Optional Angular scaffold (`component.ts` / `component.html` / `component.scss` + follow-up notes) — only when the caller opts in (e.g. project framework is Angular or user explicitly clicks "bundle Angular").
   - Implementer checklist: place files, reuse existing tokens/components, run lint + tests.
2. `features/implementer-handoff/composeHandoff.test.ts` — Jest tests covering:
   - no-project-context case (only spec + HTML).
   - with-project-context case (Angular signals).
   - includes alignmentNotes and reuseSuggestions.
   - Angular scaffold section appears when `includeAngular=true` and disappears otherwise.
   - follow-up notes surface under the Angular scaffold.
3. `features/implementer-handoff/CopyForClaudeButton.tsx` — button that:
   - reads spec, project context, variant code from store.
   - composes the handoff markdown with `includeAngular` determined by detected framework (defaults to true when framework is `angular` or unknown, false otherwise).
   - copies to clipboard AND offers a download button.
   - shows toast confirmations.
4. `components/variants/Variants.tsx` — mount `CopyForClaudeButton` next to the existing `DesignSpecTriggerButton` + `CopyAsAngularButton`.

### Track M — MCP implementer handoff tool

Owns: `mcp/src/server/tools.ts`, `mcp/src/server/tools.test.ts`.

Deliverables:

1. New MCP tool `prepare_implementer_handoff`:
   - Schema: `{ sessionId: string, variantIndex?: number, variantId?: string, persistAsContext?: boolean }`.
   - Calls `extractDesignSpec` (reuse existing client) and `getSessionExport` (to resolve the actual variant HTML).
   - Returns structured content: `{ sessionId, variantIndex, variantId, spec, annotatedMarkdown, variantCode, variantModel, projectContextSummary, implementerPrompt }`, where `implementerPrompt` is a server-composed markdown string mirroring the frontend shape (minus the Angular scaffold — the Python side does not re-implement the angular converter; it notes "run the in-UI Angular conversion if your target is Angular").
   - One-sentence text response for the content channel: `"Prepared implementer handoff for session {sessionId}, variant {variantIndex} (N chars)."`.
2. Tests:
   - Add `"prepare_implementer_handoff"` to `EXPECTED_TOOL_NAMES`.
   - Validation tests (missing variantIndex + variantId, missing sessionId, happy path).
   - Handler test: stub both `/spec` and `/export` fetches, assert both URLs are hit and `implementerPrompt` includes the spec markdown + variant HTML marker.

### Verification

- `cd frontend && corepack yarn test --runInBand` — should pick up ~5 new tests.
- `cd frontend && corepack yarn tsc --noEmit` — must stay clean.
- `cd frontend && corepack yarn lint` — must stay clean.
- `cd backend && poetry run pytest` — no backend changes; still 140 passing.
- `cd mcp && yarn tsc --noEmit -p tsconfig.server.json` — must stay clean.
- `cd mcp && node --import tsx --test src/server/tools.test.ts` — tool count rises from 10 to 11.

### Off-limits boundaries

- No backend endpoint additions. The spec + export endpoints already give us everything.
- No changes to `/generate-code` WebSocket behaviour.
- No duplication of the Angular converter in Python — the MCP handoff points at the in-UI converter in a note.
- No changes to the Round 4 alignment-note logic. That surface is stable.

---

## Round 5 results — Implementer handoff bundle (shipped)

### Files added

- `frontend/src/features/implementer-handoff/composeHandoff.ts` — pure markdown composer. Takes `{ variantIndex, variantCode, variantModel, specResult, projectContext, angularConversion, generatedAt }` and returns a single self-contained document with metadata, goal, project context, alignment notes, reuse candidates, new-components, variant HTML, optional Angular scaffold with follow-up notes, and an implementer checklist.
- `frontend/src/features/implementer-handoff/composeHandoff.test.ts` — 6 Jest tests: no-context standalone doc, with-context summary, empty-alignment elision, Angular scaffold inclusion + follow-ups, Angular scaffold omission, scan-warning surfacing.
- `frontend/src/features/implementer-handoff/CopyForClaudeButton.tsx` — fetches/caches the spec via `useDesignStore`, builds an Angular scaffold when the detected framework warrants it (via `shouldIncludeAngular`), composes with `composeHandoff`, copies to clipboard, and provides a download-as-`.md` sibling button. Toast feedback on both paths.
- `frontend/src/features/implementer-handoff/frameworkGate.ts` — pure `shouldIncludeAngular(name)` helper. Extracted from `CopyForClaudeButton` so the unit test doesn't transitively pull in the Vite-only `config.ts` and hit Jest's `import.meta.env` limitation (same issue Round 3 hit; this is the permanent fix pattern).
- `frontend/src/features/implementer-handoff/shouldIncludeAngular.test.ts` — 3 Jest tests exercising null / "unknown" / angular / react / vue / blank.
- `mcp/src/server/tools.ts` — new `prepare_implementer_handoff` tool + helpers `selectVariantFromExport`, `findProjectContextPayload`, `summarizeProjectContext`, `countEntries`, `countKeys`, `composeMcpHandoffMarkdown`. The MCP-side markdown mirrors the frontend shape minus the Angular scaffold and points Angular callers back at the in-UI "Copy as Angular" button.
- `mcp/src/server/tools.test.ts` — 6 new tests covering registration, sessionId/variant validation, negative-index rejection, happy-path parallel fetch of `/spec` + `/export`, composed markdown assertions, and a no-project-context branch verifying the "ask the user to scan" hint.

### Files modified

- `frontend/src/components/variants/Variants.tsx` — mounts `CopyForClaudeButton` next to `DesignSpecTriggerButton` and `CopyAsAngularButton`. No other behavior change.
- `mcp/.gitignore` — added `*.tsbuildinfo` so incremental build state stops polluting `git status`.

### Verification

- `cd frontend && corepack yarn test --runInBand` → **44 passed, 6 skipped, 0 failed** (was 35 passed pre-round).
- `cd frontend && corepack yarn tsc --noEmit` → clean.
- `cd frontend && corepack yarn lint` → clean.
- `cd mcp && yarn tsc --noEmit -p tsconfig.server.json` → clean.
- `cd mcp && node --import tsx --test src/server/tools.test.ts` → **22 passed, 0 failed** (was 16 passed pre-round).
- `cd backend && poetry run pytest` → 132 passed (unchanged; backend untouched this round).
- Committed as `feat: Round 5 implementer handoff bundle` and pushed to both `origin` (sethswango) and `pdt` (vu-product-development).

### Deferred / limitations

- **Initial generation is still project-unaware.** The variants emitted by `/generate-code` don't yet know about Tailwind tokens, existing components, or signals/observables/hooks signals from the target project. Today the handoff bundle injects that knowledge at the *implementer* boundary, which is the highest-leverage place — but it does not close the loop at the *generation* boundary.
- **MCP Angular conversion omitted.** The Python/TypeScript handoff cannot emit an Angular scaffold because the converter lives in the browser (`frontend/src/lib/angular-convert`). CLI consumers are instructed to drop back into the UI for the Angular path. A future round could either port the converter to TS (it's already TS in the browser — the MCP could reuse it) or accept that the UI is the canonical Angular bridge.
- **Model picker still absent at generation time.** Track B's `ModelSwitcher` (Round 2) exposes which models the backend is emitting but doesn't change them. Per-variant model override still requires `/generate-code` to accept a per-variant model list.

---

## Round 6 plan (unstarted — pick up here next session)

Candidate rounds, in decreasing leverage:

### Round 6A — Project-aware initial generation (preferred, highest ROI)

Goal: make the four initial variants themselves respect project context, not just the implementer handoff.

Sketch:

1. **Pure helper** `backend/prompts/project_brief.py::build_project_brief(context: ProjectContext | None) -> str | None`. Returns a compact ~300-char system addendum summarizing framework + state style + top 5 reusable components + top design tokens, or `None` when no usable context exists. Unit-tested in isolation.
2. **Session wiring** in `backend/routes/generate_code.py`'s `PromptCreationStage`: when `session_id` is present, call `sessions.service.latest_project_context(...)` (the helper `/sessions/{id}/spec` already uses — reuse it, don't copy). Pass the brief through to `build_prompt_messages` as a new optional kwarg `project_brief: str | None = None`. Default behavior unchanged when there is no session or no scan.
3. **Injection point** in `prompts/pipeline.build_prompt_messages`: when `project_brief` is non-empty, append a system message after the existing system prompt (do NOT prepend to user text — that contaminates user intent). The `Prompt` type already accepts additional system messages.
4. **Unit tests**:
   - `test_project_brief.py` — 5 cases: no context, Angular signals, React hooks, Vue composition, plain HTML.
   - `test_prompt_pipeline.py` — parametric test that the brief appears as a system message only when provided, never mutates history, and never leaks into user messages.
5. **End-to-end confidence without running the server**: add one integration test that drives `build_prompt_messages` with a fixture `ProjectContext` and asserts the emitted message list contains the brief at the expected index and does not change any existing message shape.

Risks / guardrails:

- Keep the brief short. Models stop paying attention to long system addenda. Target under 500 characters.
- When no session or no context, the code path is identical to today. This is the non-regression test.
- Do not touch the WebSocket envelope. All changes are inside the prompt construction leg.
- Do not touch history-mode builders (`build_update_prompt_from_history` / `..._from_file_snapshot`) — refinement should keep its current shape; the brief only lands on fresh-create paths (`build_create_prompt_from_input`).

Verification:

- `cd backend && poetry run pytest` — should gain ~10 tests and stay green.
- `cd backend && poetry run pyright` — no new warnings.
- `cd frontend && corepack yarn test --runInBand` — untouched; stays at 44 passing.
- `cd mcp && node --import tsx --test src/server/tools.test.ts` — untouched; stays at 22 passing.

### Round 6B — Real per-variant model override

Only if 6A lands cleanly and there's appetite to also close the Round 2 Track B "Deferred" item.

1. `/generate-code` WebSocket params accept `variantModels: string[]`.
2. `ALL_KEYS_MODELS_DEFAULT` becomes a fallback when the list is missing/short.
3. `ModelSwitcher` sends the list on "Re-run grid" instead of being advisory.

### Round 6C — Frontend polish

1. Success toast on generation complete pointing users at "Copy for Claude".
2. Side-by-side before/after thumbnail in `IteratePane`.
3. Visual indicator on the selected variant's "Copy for Claude" button when project context is stale (scan older than the variant).

### Off-limits boundaries for Round 6 (any sub-round)

- No changes to `mcp/src/server/tools.ts` in 6A — the handoff is frozen. It'll pick up project-aware generation automatically through the existing spec/export contract.
- No migration of the Angular converter into Python. If we want MCP-side Angular output, port the existing TS `angular-convert` package to a shared MCP module, don't rewrite.
- Keep the backend additive. `build_prompt_messages` signature change must default to `None` so existing callers keep compiling.
