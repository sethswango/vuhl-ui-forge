# Project Agent Instructions

Python environment:

- Always use the backend Poetry virtualenv (`backend-py3.10`) for Python commands.
- Preferred invocation: `cd backend && poetry run <command>`.
- If you need to activate directly, use Poetry to discover it in the current environment:
  - `cd backend && poetry env activate` (then run the `source .../bin/activate` command it prints)

Testing policy:

- Always run backend tests after every code change: `cd backend && poetry run pytest`.
- Always run type checking after every code change: `cd backend && poetry run pyright`.
- Type checking policy: no new warnings in changed files (`pyright`).

## Frontend

- Frontend: `cd frontend && yarn lint`

If changes touch both, run both sets.

## Prompt formatting

- Prefer triple-quoted strings (`"""..."""`) for multi-line prompt text.
- For interpolated multi-line prompts, prefer a single triple-quoted f-string over concatenated string fragments.

# Hosted

The hosted version is on the `hosted` branch. The `hosted` branch connects to a saas backend, which is a seperate codebase at ../screenshot-to-code-saas

# Local conventions

- For Python functions, do not add docstrings unless they are genuinely needed.
- Ensure files end with a trailing newline.
- Use type hints in Python where practical.
- Frontend tests: `cd frontend && yarn test` or `npm run test:frontend`
- Backend tests: `cd backend && poetry run pytest` or `npm run test:backend`
- Full test sweep: `npm test`
