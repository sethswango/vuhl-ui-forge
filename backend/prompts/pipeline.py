from custom_types import InputMode
from prompts.create import build_create_prompt_from_input
from prompts.message_builder import Prompt
from prompts.plan import derive_prompt_construction_plan
from prompts.prompt_types import PromptHistoryMessage, Stack, UserTurnInput
from prompts.update import (
    build_update_prompt_from_file_snapshot,
    build_update_prompt_from_history,
)


async def build_prompt_messages(
    stack: Stack,
    input_mode: InputMode,
    generation_type: str,
    prompt: UserTurnInput,
    history: list[PromptHistoryMessage],
    file_state: dict[str, str] | None = None,
    image_generation_enabled: bool = True,
    project_brief: str | None = None,
) -> Prompt:
    plan = derive_prompt_construction_plan(
        stack=stack,
        input_mode=input_mode,
        generation_type=generation_type,
        history=history,
        file_state=file_state,
    )

    strategy = plan["construction_strategy"]
    if strategy == "update_from_history":
        messages = build_update_prompt_from_history(
            stack=stack,
            history=history,
            image_generation_enabled=image_generation_enabled,
        )
    elif strategy == "update_from_file_snapshot":
        assert file_state is not None
        messages = build_update_prompt_from_file_snapshot(
            stack=stack,
            prompt=prompt,
            file_state=file_state,
            image_generation_enabled=image_generation_enabled,
        )
    else:
        messages = build_create_prompt_from_input(
            input_mode,
            stack,
            prompt,
            image_generation_enabled,
        )

    if project_brief:
        _append_to_system_message(messages, project_brief)
    return messages


def _append_to_system_message(messages: Prompt, addendum: str) -> None:
    """Merge a project brief into the first system message in-place.

    We splice the brief onto the existing system prompt instead of emitting a
    second system-role message for portability: Anthropic's chat API only
    accepts one system message per request, and downstream adapters in this
    codebase assume the first element carries *the* system prompt. A single
    merged message travels cleanly through every provider without special
    casing.

    If somehow the first message is not a system role (e.g. a future prompt
    builder skips it), we quietly inject a system message at the head. This
    keeps the pipeline resilient even as the builders evolve. Brief text is
    trusted: callers are expected to have produced it via
    :func:`prompts.project_brief.build_project_brief`.
    """
    stripped = addendum.strip()
    if not stripped:
        return

    if messages and messages[0].get("role") == "system":
        current = messages[0].get("content")
        if isinstance(current, str):
            messages[0]["content"] = f"{current.rstrip()}\n\n{stripped}\n"
            return
        # Non-string system content is unexpected (builders today always emit
        # strings), but prepending a fresh system message is a safe fallback
        # that preserves the original content verbatim for the model.
    messages.insert(0, {"role": "system", "content": stripped})
