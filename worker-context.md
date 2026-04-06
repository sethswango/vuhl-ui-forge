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
