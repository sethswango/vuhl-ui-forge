"""Pipeline-level tests for project-brief injection.

Complements :mod:`test_project_brief` (pure brief rendering) and
:mod:`test_prompts` (plan + strategy selection). The purpose here is narrow:
verify that when a brief string reaches ``build_prompt_messages``, it is
merged into the first system message without disturbing the rest of the
prompt — across every construction strategy (create from text/image,
update from history, update from file snapshot).
"""

from __future__ import annotations

import sys
from typing import cast
from unittest.mock import MagicMock

import pytest

# Match the guard in test_prompts.py: prompts.* imports moviepy indirectly.
sys.modules.setdefault("moviepy", MagicMock())
sys.modules.setdefault("moviepy.editor", MagicMock())

from prompts.pipeline import _append_to_system_message, build_prompt_messages
from prompts.prompt_types import PromptHistoryMessage, Stack, UserTurnInput


_STACK: Stack = "html_tailwind"
_PROMPT: UserTurnInput = {"text": "make me a settings page", "images": [], "videos": []}

_BRIEF = (
    "# Project alignment brief\n\n"
    "**Framework:** angular 18, typescript.\n\n"
    "**Reusable components (reference these by selector/name when the screenshot matches):**\n"
    "- `<app-button>` — src/app/shared/button.component.ts\n\n"
    "## Alignment rules\n- Prefer the tokens, selectors, and conventions listed above..."
)


def _first_system_content(messages):
    assert messages, "pipeline must return at least one message"
    first = messages[0]
    assert first.get("role") == "system", f"expected system first, got {first.get('role')}"
    content = first.get("content")
    assert isinstance(content, str), f"system content should be a string, got {type(content)}"
    return content


@pytest.mark.asyncio
async def test_create_text_mode_appends_brief_to_system_message():
    """The brief should attach to the first system message for create paths.

    This is the core Round 6C path: a fresh session with a scanned project
    context producing a brief that steers the initial four variants toward
    existing tokens and components.
    """
    messages = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="create",
        prompt=_PROMPT,
        history=[],
        project_brief=_BRIEF,
    )
    system_content = _first_system_content(messages)
    assert "Project alignment brief" in system_content
    assert "app-button" in system_content
    # Existing system prompt must still be present; we append, not replace.
    assert "coding agent" in system_content.lower()


@pytest.mark.asyncio
async def test_create_image_mode_appends_brief_to_system_message():
    """Same behavior for image mode (the primary input for this tool)."""
    messages = await build_prompt_messages(
        stack=_STACK,
        input_mode="image",
        generation_type="create",
        prompt={
            "text": "here is a screenshot",
            "images": ["data:image/png;base64,iVBORw0KGgo="],
            "videos": [],
        },
        history=[],
        project_brief=_BRIEF,
    )
    system_content = _first_system_content(messages)
    assert "Project alignment brief" in system_content
    # The user message should remain structurally an image-bearing array, not
    # string content — asserting this guards against a silent regression that
    # pushes the brief into the wrong role.
    user_message = messages[1]
    assert user_message["role"] == "user"
    assert isinstance(user_message["content"], list)


@pytest.mark.asyncio
async def test_update_from_history_appends_brief_to_system_message():
    """Update paths also get the brief so iteration stays on-brand.

    When the user iterates on a variant (update mode), the brief still
    applies — subsequent edits should keep reusing the same tokens and
    components.
    """
    history: list[PromptHistoryMessage] = [
        cast(PromptHistoryMessage, {"role": "user", "text": "initial request"}),
        cast(PromptHistoryMessage, {"role": "assistant", "text": "<html><body>v1</body></html>"}),
        cast(PromptHistoryMessage, {"role": "user", "text": "make the header bigger"}),
    ]
    messages = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="update",
        prompt=_PROMPT,
        history=history,
        project_brief=_BRIEF,
    )
    system_content = _first_system_content(messages)
    assert "Project alignment brief" in system_content


@pytest.mark.asyncio
async def test_update_from_file_snapshot_appends_brief_to_system_message():
    """File-snapshot updates (post-variant edits) also get the brief."""
    messages = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="update",
        prompt={"text": "shrink the padding", "images": [], "videos": []},
        history=[],
        file_state={"path": "index.html", "content": "<html></html>"},
        project_brief=_BRIEF,
    )
    system_content = _first_system_content(messages)
    assert "Project alignment brief" in system_content


@pytest.mark.asyncio
async def test_no_brief_leaves_system_prompt_untouched():
    """Back-compat guarantee: a None brief must not alter the original prompt.

    This pins behavior for sessions that haven't gathered project context yet.
    A drift here would silently change the default prompt for every user,
    so it belongs under test.
    """
    baseline = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="create",
        prompt=_PROMPT,
        history=[],
    )
    with_none = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="create",
        prompt=_PROMPT,
        history=[],
        project_brief=None,
    )
    assert baseline == with_none


@pytest.mark.asyncio
async def test_empty_brief_is_treated_as_no_brief():
    """An empty string must also leave the system prompt untouched.

    ``build_project_brief`` returns ``None`` for empty contexts today, but
    a future caller could reasonably pass ``""`` — the pipeline should treat
    both cases identically rather than emitting a stray blank line.
    """
    baseline = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="create",
        prompt=_PROMPT,
        history=[],
    )
    with_empty = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="create",
        prompt=_PROMPT,
        history=[],
        project_brief="   \n  ",
    )
    assert baseline == with_empty


def test_append_helper_merges_into_existing_system_message():
    """Direct unit test of the internal helper."""
    messages: list = [
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "hello"},
    ]
    _append_to_system_message(messages, "EXTRA BRIEF")
    assert isinstance(messages[0]["content"], str)
    assert messages[0]["content"].startswith("You are helpful.")
    assert "EXTRA BRIEF" in messages[0]["content"]
    assert messages[1] == {"role": "user", "content": "hello"}


def test_append_helper_injects_system_when_first_is_not_system():
    """Safety net: if a future builder forgets to lead with a system message,
    we inject one rather than silently dropping the brief.
    """
    messages: list = [{"role": "user", "content": "hello"}]
    _append_to_system_message(messages, "BRIEF")
    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == "BRIEF"
    assert messages[1] == {"role": "user", "content": "hello"}


def test_append_helper_no_ops_on_empty_brief():
    messages: list = [{"role": "system", "content": "unchanged"}]
    _append_to_system_message(messages, "   \n   ")
    assert messages == [{"role": "system", "content": "unchanged"}]


@pytest.mark.asyncio
async def test_brief_does_not_leak_into_user_message():
    """The brief must land in the system channel, never the user channel.

    If it ever leaked into the user message, the LLM would see our internal
    meta-guidance as user intent — which would silently warp the output.
    """
    messages = await build_prompt_messages(
        stack=_STACK,
        input_mode="text",
        generation_type="create",
        prompt=_PROMPT,
        history=[],
        project_brief=_BRIEF,
    )
    for message in messages[1:]:
        content = message.get("content")
        if isinstance(content, str):
            assert "Project alignment brief" not in content
        elif isinstance(content, list):
            for part in content:
                text = part.get("text") if isinstance(part, dict) else None
                if text:
                    assert "Project alignment brief" not in text
