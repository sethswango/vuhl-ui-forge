"""Tests for the auto-session flow in routes.generate_code.

Round 6A established the rule: a user who opens a WebSocket without a
``sessionId`` gets a server-minted session on the very first turn so
project context, design spec, and implementer handoff all light up by
default. These tests pin that behavior — including the graceful fallback
when the store errors — so later refactors cannot quietly regress it.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest

from routes.generate_code import (
    ExtractedParams,
    PipelineContext,
    SessionEnsureMiddleware,
    _AUTO_SESSION_NAME_FALLBACK,
    _AUTO_SESSION_NAME_MAX_LEN,
    _derive_session_name,
    ensure_session_for_params,
)
from sessions.service import SessionService
from sessions.store import SessionStore


def _make_params(**overrides: Any) -> ExtractedParams:
    defaults: dict[str, Any] = dict(
        stack="html_tailwind",
        input_mode="image",
        should_generate_images=True,
        openai_api_key=None,
        anthropic_api_key=None,
        gemini_api_key="key",
        openai_base_url=None,
        generation_type="create",
        prompt={"text": "Build a login form", "images": [], "videos": []},
        history=[],
        file_state=None,
        option_codes=[],
        session_id=None,
    )
    defaults.update(overrides)
    return ExtractedParams(**defaults)


def _capture_messages() -> tuple[list[tuple[str, str | None, int, dict | None]], Any]:
    sent: list[tuple[str, str | None, int, dict | None]] = []

    async def send_message(
        msg_type: str,
        value: str | None,
        variant_index: int,
        data: dict | None = None,
        eventId: str | None = None,
    ) -> None:
        sent.append((msg_type, value, variant_index, data))

    return sent, send_message


def test_derive_session_name_uses_first_line() -> None:
    params = _make_params(
        prompt={"text": "A tight hero block\nwith two CTAs", "images": [], "videos": []}
    )
    assert _derive_session_name(params) == "A tight hero block"


def test_derive_session_name_truncates_long_text() -> None:
    long_text = "x" * (_AUTO_SESSION_NAME_MAX_LEN + 25)
    params = _make_params(prompt={"text": long_text, "images": [], "videos": []})
    name = _derive_session_name(params)
    assert len(name) == _AUTO_SESSION_NAME_MAX_LEN
    assert name.endswith("…")


def test_derive_session_name_falls_back_for_media_only_turn() -> None:
    params = _make_params(
        prompt={"text": "   ", "images": ["data:image/png;base64,x"], "videos": []}
    )
    assert _derive_session_name(params) == _AUTO_SESSION_NAME_FALLBACK


@pytest.mark.asyncio
async def test_ensure_session_creates_and_emits_event(
    tmp_path, monkeypatch
) -> None:
    """A turn without sessionId gets a fresh session and emits a session event.

    The event has to fire on the same socket before any chunk/status/setCode
    output so the frontend can call history.replaceState first. Verifying
    the event keeps that contract honest.
    """
    store = SessionStore(tmp_path / "auto.db")
    service = SessionService(store)
    monkeypatch.setattr("routes.generate_code.session_service", service)

    params = _make_params(session_id=None)
    sent, send_message = _capture_messages()

    session_id = await ensure_session_for_params(params, send_message)

    assert session_id is not None
    assert params.session_id == session_id
    assert any(msg[0] == "session" and msg[1] == session_id for msg in sent)

    bundle = store.get_session_bundle(session_id)
    assert bundle.session.name == "Build a login form"
    assert bundle.session.stack == "html_tailwind"
    assert bundle.session.input_mode == "image"
    assert bundle.session.metadata.get("auto_created") is True


@pytest.mark.asyncio
async def test_ensure_session_is_noop_when_client_already_has_one(
    tmp_path, monkeypatch
) -> None:
    """An explicit sessionId from the client must not trigger a second session."""
    store = SessionStore(tmp_path / "existing.db")
    service = SessionService(store)
    monkeypatch.setattr("routes.generate_code.session_service", service)

    pre_existing = store.create_session(
        name="Existing",
        stack="html_tailwind",
        input_mode="image",
        metadata={},
    )

    params = _make_params(session_id=pre_existing.session.id)
    sent, send_message = _capture_messages()

    result = await ensure_session_for_params(params, send_message)

    assert result == pre_existing.session.id
    assert params.session_id == pre_existing.session.id
    assert all(msg[0] != "session" for msg in sent), (
        "should not emit a session event when the client already has one"
    )


@pytest.mark.asyncio
async def test_ensure_session_swallows_store_errors(monkeypatch) -> None:
    """Store failures must not abort generation.

    Users should still get a usable set of variants even if the SQLite layer
    is unhappy. The function logs and returns None; downstream recording
    already handles a missing session gracefully.
    """

    class BrokenService:
        async def create_session(self, **_: Any) -> Any:
            raise RuntimeError("disk full")

    monkeypatch.setattr("routes.generate_code.session_service", BrokenService())

    params = _make_params(session_id=None)
    sent, send_message = _capture_messages()

    result = await ensure_session_for_params(params, send_message)

    assert result is None
    assert params.session_id is None
    assert all(msg[0] != "session" for msg in sent)


@pytest.mark.asyncio
async def test_middleware_integrates_with_pipeline_context(
    tmp_path, monkeypatch
) -> None:
    """Smoke-test the middleware: it must call next_func and populate session_id."""
    store = SessionStore(tmp_path / "pipeline.db")
    service = SessionService(store)
    monkeypatch.setattr("routes.generate_code.session_service", service)

    context = PipelineContext(websocket=MagicMock())
    sent, send_message = _capture_messages()
    context.ws_comm = cast(
        Any,
        SimpleNamespace(send_message=send_message, throw_error=AsyncMock()),
    )
    context.extracted_params = _make_params(session_id=None)

    next_called = False

    async def next_func() -> None:
        nonlocal next_called
        next_called = True

    await SessionEnsureMiddleware().process(context, next_func)

    assert next_called is True
    assert context.extracted_params.session_id is not None
    assert any(msg[0] == "session" for msg in sent)
