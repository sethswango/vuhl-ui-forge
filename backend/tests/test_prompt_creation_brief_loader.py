"""Tests for :meth:`PromptCreationStage._load_project_brief`.

This is the glue between session persistence and the prompt pipeline. The
loader has a narrow contract:

- Return ``None`` for sessionless turns (Round 6A hasn't minted one yet, or
  the user explicitly opted out).
- Return ``None`` for unknown sessions rather than crashing generation.
- Return ``None`` when the session has no project context (scanner not yet
  run) — don't emit a "framework: unknown" header.
- Return a non-empty brief string when context is present.
- Swallow unexpected store errors so a bad SQLite state never blocks code
  generation; surface the error to logs instead.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from context.models import ComponentInfo, FrameworkInfo, ProjectContext
from routes.generate_code import ExtractedParams, PromptCreationStage
from sessions.service import SessionNotFoundError


def _params(session_id: str | None = None) -> ExtractedParams:
    return ExtractedParams(
        stack="html_tailwind",
        input_mode="text",
        should_generate_images=True,
        openai_api_key=None,
        anthropic_api_key=None,
        gemini_api_key="key",
        openai_base_url=None,
        generation_type="create",
        prompt={"text": "Hello", "images": [], "videos": []},
        history=[],
        file_state=None,
        option_codes=[],
        session_id=session_id,
    )


@pytest.mark.asyncio
async def test_load_project_brief_returns_none_when_no_session_id() -> None:
    brief = await PromptCreationStage._load_project_brief(None)
    assert brief is None


@pytest.mark.asyncio
async def test_load_project_brief_returns_none_for_unknown_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An unknown session id must not raise — Round 6A can transparently
    mint a new session after the prompt path started, and we should not
    require a synchronization barrier between the two.
    """
    get_session = AsyncMock(side_effect=SessionNotFoundError("missing"))
    monkeypatch.setattr(
        "routes.generate_code.session_service.get_session", get_session
    )
    brief = await PromptCreationStage._load_project_brief("ghost")
    assert brief is None


@pytest.mark.asyncio
async def test_load_project_brief_returns_none_when_no_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Valid session, but no project scan yet → no brief."""
    fake_bundle = object()
    get_session = AsyncMock(return_value=fake_bundle)
    monkeypatch.setattr(
        "routes.generate_code.session_service.get_session", get_session
    )
    monkeypatch.setattr(
        "routes.generate_code.latest_project_context", lambda bundle: None
    )
    brief = await PromptCreationStage._load_project_brief("session-1")
    assert brief is None
    get_session.assert_awaited_once_with("session-1")


@pytest.mark.asyncio
async def test_load_project_brief_renders_brief_when_context_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Happy path: session has a scanned project, brief is produced."""
    fake_bundle = object()
    project = ProjectContext(
        repo_path="/tmp/app",
        framework=FrameworkInfo(name="angular", language="typescript"),
        components=[
            ComponentInfo(
                name="AppButton",
                selector="app-button",
                file_path="src/app/shared/button.component.ts",
                kind="angular_component",
            )
        ],
    )
    get_session = AsyncMock(return_value=fake_bundle)
    monkeypatch.setattr(
        "routes.generate_code.session_service.get_session", get_session
    )
    monkeypatch.setattr(
        "routes.generate_code.latest_project_context", lambda bundle: project
    )
    brief = await PromptCreationStage._load_project_brief("session-1")
    assert brief is not None
    assert "Project alignment brief" in brief
    assert "angular" in brief
    assert "app-button" in brief


@pytest.mark.asyncio
async def test_load_project_brief_swallows_unexpected_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A store-level error must not abort the generation pipeline.

    If SQLite is wedged, users still want their generation to succeed —
    without the alignment nudge, but succeeding is more important than
    being perfectly aligned.
    """
    get_session = AsyncMock(side_effect=RuntimeError("db wedged"))
    monkeypatch.setattr(
        "routes.generate_code.session_service.get_session", get_session
    )
    brief = await PromptCreationStage._load_project_brief("session-1")
    assert brief is None


@pytest.mark.asyncio
async def test_prompt_stage_injects_brief_into_assembled_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End-to-end through the stage: loader + pipeline deliver the brief.

    This is a thin integration that catches any wiring regression — the
    loader could return the brief correctly, but the stage could forget to
    pass it into :func:`build_prompt_messages`. This test would fail in
    that case even when every other test passes.
    """
    fake_bundle = object()
    project = ProjectContext(
        repo_path="/tmp/app",
        framework=FrameworkInfo(name="angular", language="typescript"),
        components=[
            ComponentInfo(
                name="AppButton",
                selector="app-button",
                file_path="src/app/shared/button.component.ts",
                kind="angular_component",
            )
        ],
    )
    monkeypatch.setattr(
        "routes.generate_code.session_service.get_session",
        AsyncMock(return_value=fake_bundle),
    )
    monkeypatch.setattr(
        "routes.generate_code.latest_project_context", lambda bundle: project
    )

    stage = PromptCreationStage(AsyncMock())
    messages = await stage.build_prompt_messages(_params(session_id="session-1"))

    assert messages, "stage must produce a non-empty prompt"
    system = messages[0]
    assert system.get("role") == "system"
    content = system.get("content")
    assert isinstance(content, str)
    assert "Project alignment brief" in content
    assert "app-button" in content


@pytest.mark.asyncio
async def test_prompt_stage_produces_baseline_prompt_without_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Back-compat: sessionless calls must still assemble the original
    system prompt unchanged. This is the most common pre-6A invocation
    shape and any regression here would break every baseline user.
    """
    stage = PromptCreationStage(AsyncMock())
    messages = await stage.build_prompt_messages(_params(session_id=None))

    assert messages
    system = messages[0]
    assert system.get("role") == "system"
    content = system.get("content")
    assert isinstance(content, str)
    assert "Project alignment brief" not in content
