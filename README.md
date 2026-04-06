# VuhluiForge

`VuhluiForge` is Seth Swango's preserved local fork of the `abi/screenshot-to-code` project.

This repo is the app-side half of the broader VuhluiForge effort:

- `C:\dev\Screenshot-To-Code` preserves the open-source app fork and local adjustments.
- `C:\dev\Screenshot-To-Code-MCP` is the MCP-oriented companion project for context-aware IDE workflows and Angular-oriented generation.

## Current Local State

This local copy is intentionally preserved as-is because it contains local adjustments and project framing that should not be discarded.

At the moment, the checked-in files are a lightweight shell around the original app:

- root-level repo metadata and package manifests
- Docker and workspace configuration
- agent guidance in `CLAUDE.md`
- historical planning/testing notes that have now been consolidated into this README

The upstream app's `frontend/` and `backend/` source directories are not currently present in this local snapshot, so the repo should be treated as a preserved fork shell until the source tree is rehydrated or synced back in.

## Relationship To Upstream

- Upstream project: [`abi/screenshot-to-code`](https://github.com/abi/screenshot-to-code)
- Local role: preserve customizations, naming, and project context for VuhluiForge
- Future sync model: keep an `upstream` remote pointing at `abi/screenshot-to-code` so upstream changes can be reviewed and pulled in deliberately

## Repo Scope

This repo is for the app/fork side of VuhluiForge, not the MCP server.

Use this repo for:

- upstream app tracking
- local fork-specific adjustments
- preserving configuration and package metadata for the app side

Use the MCP repo for:

- context-aware generation workflows
- MCP transport and tool design
- Angular-aware design-to-code integration ideas

## Tooling Notes

The original app architecture is a React/Vite frontend plus a FastAPI backend, with Docker support and npm workspace orchestration at the root. The current root manifest still reflects that structure so the source tree can be restored without redefining the workspace.

Existing root scripts:

```bash
npm run test
npm run test:frontend
npm run test:backend
```

These scripts assume `frontend/` and `backend/` are present.

## Historical Notes Consolidated Here

The old repo-local docs have been folded into this README to keep the repository documentation lean:

- testing guidance referred to backend `pytest` and frontend workspace tests
- evaluation notes described a screenshot-based eval flow under `backend/evals_data`
- troubleshooting mostly pointed back to upstream OpenAI/account setup
- planning notes described non-blocking variant generation in the original app

Those details now belong either in:

- upstream `screenshot-to-code` documentation
- the VuhluiForge MCP repo
- or the Obsidian project notes for durable local context

## Publishing

Expected personal GitHub repo:

- `https://github.com/sethswango/vuhl-ui-forge`

This repo is intentionally separate from the MCP publication target.

## Related Docs

- `C:\dev\Screenshot-To-Code-MCP\README.md`
- `C:\dev\Obsidian_Notes\VU-Obsidian\Projects\VUHL UI Forge\VUHL UI Forge Status.md`
- `C:\dev\Obsidian_Notes\VU-Obsidian\Projects\screenshot-to-code\screenshot-to-code.md`
