from unittest.mock import AsyncMock

import pytest

from routes.generate_code import ParameterExtractionStage


@pytest.mark.asyncio
async def test_extracts_gemini_api_key_from_settings_dialog() -> None:
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "openAiApiKey": "",
            "anthropicApiKey": "",
            "geminiApiKey": "gemini-from-ui",
            "prompt": {"text": "hello"},
        }
    )

    assert extracted.gemini_api_key == "gemini-from-ui"


@pytest.mark.asyncio
async def test_extracts_gemini_api_key_from_env_when_not_in_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("routes.generate_code.GEMINI_API_KEY", "gemini-from-env")
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "prompt": {"text": "hello"},
        }
    )

    assert extracted.gemini_api_key == "gemini-from-env"


@pytest.mark.asyncio
async def test_extracts_session_id_when_provided() -> None:
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "prompt": {"text": "hello"},
            "sessionId": "session-123",
        }
    )

    assert extracted.session_id == "session-123"


@pytest.mark.asyncio
async def test_model_preset_defaults_to_none_when_absent() -> None:
    """Absent ``modelPreset`` must stay ``None`` so downstream logic can
    distinguish "user hasn't picked" from "user explicitly chose balanced".
    """
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "prompt": {"text": "hello"},
        }
    )

    assert extracted.model_preset is None


@pytest.mark.asyncio
async def test_model_preset_accepts_known_values() -> None:
    stage = ParameterExtractionStage(AsyncMock())

    for preset in ("balanced", "fast", "quality", "diverse"):
        extracted = await stage.extract_and_validate(
            {
                "generatedCodeConfig": "html_tailwind",
                "inputMode": "text",
                "prompt": {"text": "hello"},
                "modelPreset": preset,
            }
        )
        assert extracted.model_preset == preset, (
            f"Expected known preset {preset!r} to be accepted"
        )


@pytest.mark.asyncio
async def test_model_preset_ignores_unknown_values() -> None:
    """Unknown preset strings are dropped (not errored) so a stale client
    or typo never takes down a generation request."""
    stage = ParameterExtractionStage(AsyncMock())

    extracted = await stage.extract_and_validate(
        {
            "generatedCodeConfig": "html_tailwind",
            "inputMode": "text",
            "prompt": {"text": "hello"},
            "modelPreset": "legendary",
        }
    )

    assert extracted.model_preset is None


@pytest.mark.asyncio
async def test_model_preset_ignores_non_string_values() -> None:
    """Defensive coverage for unexpected payload shapes — integers,
    objects, ``None``, and empty strings all collapse to ``None``."""
    stage = ParameterExtractionStage(AsyncMock())

    bad_values: list[object] = [
        0,
        42,
        None,
        "",
        "   ",
        {"preset": "fast"},
        ["fast"],
    ]
    for bad_value in bad_values:
        extracted = await stage.extract_and_validate(
            {
                "generatedCodeConfig": "html_tailwind",
                "inputMode": "text",
                "prompt": {"text": "hello"},
                "modelPreset": bad_value,
            }
        )
        assert extracted.model_preset is None, (
            f"Non-string preset {bad_value!r} should collapse to None"
        )
