# VuhluiForge

VuhluiForge is a unified design-to-code workbench built from the open-source [`abi/screenshot-to-code`](https://github.com/abi/screenshot-to-code) engine and extended for project-aware workflows.

Instead of treating "screenshot to code" as the product name, this repo positions that capability as one engine inside a broader toolchain:

- screenshot and mockup generation
- text and recording-based generation
- iterative edit flows
- future MCP and IDE-driven workflows
- codebase-aware Angular and component integration

## What This Repo Contains

This repo is now the canonical home for the VuhluiForge codebase.

Top-level structure:

- `frontend/` - React/Vite application
- `backend/` - FastAPI backend and model/provider pipeline
- `mcp/` - VuhluiForge MCP package and project-aware workflow layer

## Supported Output Stacks

- HTML + Tailwind
- HTML + CSS
- React + Tailwind
- Vue + Tailwind
- Bootstrap
- Ionic + Tailwind
- SVG

## Supported Models

- Gemini 3 Flash and Pro
- Claude Opus 4.5
- GPT-5.3, GPT-5.2, GPT-4.1
- Other configured providers as supported by the backend
- DALL-E 3 or Flux Schnell for image generation

## Getting Started

The app has a React/Vite frontend and a FastAPI backend.

Required API keys:

- OpenAI, Anthropic, or Gemini
- multiple keys are recommended if you want to compare model outputs

Backend:

```bash
cd backend
echo "OPENAI_API_KEY=sk-your-key" > .env
echo "ANTHROPIC_API_KEY=your-key" >> .env
echo "GEMINI_API_KEY=your-key" >> .env
poetry install
poetry env activate
poetry run uvicorn main:app --reload --port 7001
```

Frontend:

```bash
cd frontend
yarn
yarn dev
```

Open `http://localhost:5173` to use the app.

If you prefer a different backend port, update `VITE_WS_BACKEND_URL` in `frontend/.env.local`.

## Docker

```bash
echo "OPENAI_API_KEY=sk-your-key" > .env
docker-compose up -d --build
```

## MCP Direction

The `mcp/` area is where VuhluiForge adds project-aware workflows on top of the core design-to-code engine.

The goal is not just generating code from an image, but generating code that fits an existing codebase by incorporating:

- Angular version and conventions
- selector prefixes
- shared components
- service availability
- CSS variables and design tokens
- feature-specific integration context

## Upstream Relationship

- Canonical local/personal repo: `https://github.com/sethswango/vuhl-ui-forge`
- Upstream engine: `https://github.com/abi/screenshot-to-code`
- Work remote currently used for MCP-oriented sharing: `https://github.com/vu-pdt/VUHL-UI-Forge-MCP`

The intent is to keep pulling ideas and improvements from upstream while evolving VuhluiForge toward project-aware implementation workflows.

## Related Docs

- `C:\dev\Obsidian_Notes\VU-Obsidian\Projects\VUHL UI Forge\VUHL UI Forge Status.md`
- `C:\dev\Obsidian_Notes\VU-Obsidian\Projects\screenshot-to-code\screenshot-to-code.md`
- `C:\dev\Obsidian_Notes\VU-Obsidian\Projects\screenshot-to-code-mcp\screenshot-to-code-mcp.md`
