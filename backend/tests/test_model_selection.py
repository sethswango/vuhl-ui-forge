import pytest
from unittest.mock import AsyncMock
from routes.generate_code import ModelSelectionStage
from llm import Llm


class TestModelSelectionAllKeys:
    """Test model selection when Gemini, Anthropic, and OpenAI API keys are present."""

    def setup_method(self):
        """Set up test fixtures."""
        mock_throw_error = AsyncMock()
        self.model_selector = ModelSelectionStage(mock_throw_error)

    @pytest.mark.asyncio
    async def test_gemini_anthropic_create(self):
        """All keys: fixed order for four variants."""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="text",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
        )

        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GPT_5_2_CODEX_HIGH,
            Llm.CLAUDE_OPUS_4_6,
            Llm.GEMINI_3_1_PRO_PREVIEW_LOW,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_gemini_anthropic_update_text(self):
        """All keys text update: uses two fast edit variants."""
        models = await self.model_selector.select_models(
            generation_type="update",
            input_mode="text",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
        )

        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GPT_5_4_2026_03_05_LOW,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_gemini_anthropic_update(self):
        """All keys image update: uses two fast edit variants."""
        models = await self.model_selector.select_models(
            generation_type="update",
            input_mode="image",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
        )

        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GPT_5_4_2026_03_05_LOW,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_video_create_prefers_gemini_minimal_then_3_1_high(self):
        """Video create always uses two Gemini variants in fixed order."""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="video",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
        )

        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_video_update_prefers_gemini_minimal_then_3_1_high(self):
        """Video update always uses the same two Gemini variants as video create."""
        models = await self.model_selector.select_models(
            generation_type="update",
            input_mode="video",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
        )

        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
        ]
        assert models == expected


class TestModelSelectionOpenAIAnthropic:
    """Test model selection when only OpenAI and Anthropic keys are present."""

    def setup_method(self):
        """Set up test fixtures."""
        mock_throw_error = AsyncMock()
        self.model_selector = ModelSelectionStage(mock_throw_error)

    @pytest.mark.asyncio
    async def test_openai_anthropic(self):
        """OpenAI + Anthropic: Claude Opus 4.6, GPT 5.2 Codex (high/medium), cycling"""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="text",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key=None,
        )

        expected = [
            Llm.CLAUDE_OPUS_4_6,
            Llm.GPT_5_2_CODEX_HIGH,
            Llm.GPT_5_2_CODEX_MEDIUM,
            Llm.CLAUDE_OPUS_4_6,
        ]
        assert models == expected


class TestModelSelectionAnthropicOnly:
    """Test model selection when only Anthropic key is present."""

    def setup_method(self):
        """Set up test fixtures."""
        mock_throw_error = AsyncMock()
        self.model_selector = ModelSelectionStage(mock_throw_error)

    @pytest.mark.asyncio
    async def test_anthropic_only(self):
        """Anthropic only: Claude Opus 4.6 and Claude Sonnet 4.6 cycling"""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="text",
            openai_api_key=None,
            anthropic_api_key="key",
            gemini_api_key=None,
        )

        expected = [
            Llm.CLAUDE_OPUS_4_6,
            Llm.CLAUDE_SONNET_4_6,
            Llm.CLAUDE_OPUS_4_6,
            Llm.CLAUDE_SONNET_4_6,
        ]
        assert models == expected


class TestModelSelectionOpenAIOnly:
    """Test model selection when only OpenAI key is present."""

    def setup_method(self):
        """Set up test fixtures."""
        mock_throw_error = AsyncMock()
        self.model_selector = ModelSelectionStage(mock_throw_error)

    @pytest.mark.asyncio
    async def test_openai_only(self):
        """OpenAI only: GPT 5.2 Codex (high/medium) only"""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="text",
            openai_api_key="key",
            anthropic_api_key=None,
            gemini_api_key=None,
        )

        expected = [
            Llm.GPT_5_2_CODEX_HIGH,
            Llm.GPT_5_2_CODEX_MEDIUM,
            Llm.GPT_5_2_CODEX_HIGH,
            Llm.GPT_5_2_CODEX_MEDIUM,
        ]
        assert models == expected


class TestModelSelectionNoKeys:
    """Test model selection when no API keys are present."""

    def setup_method(self):
        """Set up test fixtures."""
        mock_throw_error = AsyncMock()
        self.model_selector = ModelSelectionStage(mock_throw_error)

    @pytest.mark.asyncio
    async def test_no_keys_raises_error(self):
        """No keys: Should raise an exception"""
        with pytest.raises(Exception, match="No API key"):
            await self.model_selector.select_models(
                generation_type="create",
                input_mode="text",
                openai_api_key=None,
                anthropic_api_key=None,
                gemini_api_key=None,
            )


class TestModelSelectionPresets:
    """Model preset selection (the user-facing 'mood' for the create grid)."""

    def setup_method(self):
        mock_throw_error = AsyncMock()
        self.model_selector = ModelSelectionStage(mock_throw_error)

    @pytest.mark.asyncio
    async def test_balanced_preset_matches_legacy_default(self):
        """'balanced' must be a no-op so existing users see no behavior change."""
        baseline = await self.model_selector.select_models(
            generation_type="create",
            input_mode="image",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset=None,
        )
        with_preset = await self.model_selector.select_models(
            generation_type="create",
            input_mode="image",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset="balanced",
        )
        assert baseline == with_preset

    @pytest.mark.asyncio
    async def test_fast_preset_uses_only_gemini_flash(self):
        """'fast' should emphasize Gemini Flash for snappy iteration."""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="image",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset="fast",
        )
        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_quality_preset_uses_slow_strong_models(self):
        """'quality' should prefer Opus and high-thinking variants."""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="image",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset="quality",
        )
        expected = [
            Llm.CLAUDE_OPUS_4_6,
            Llm.GPT_5_2_CODEX_XHIGH,
            Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
            Llm.CLAUDE_OPUS_4_6,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_diverse_preset_spans_providers(self):
        """'diverse' should hit Anthropic, OpenAI, and Gemini in one grid."""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="image",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset="diverse",
        )
        providers = {
            Llm.CLAUDE_OPUS_4_6: "anthropic",
            Llm.GPT_5_2_CODEX_HIGH: "openai",
            Llm.GEMINI_3_1_PRO_PREVIEW_HIGH: "gemini",
            Llm.GEMINI_3_FLASH_PREVIEW_HIGH: "gemini",
        }
        seen_providers = {providers[m] for m in models}
        assert seen_providers == {"anthropic", "openai", "gemini"}

    @pytest.mark.asyncio
    async def test_preset_ignored_when_key_missing(self):
        """Presets require all three provider keys; partial keys fall back to
        the legacy key-subset logic rather than failing or degrading silently
        to a preset that can't run."""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="text",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key=None,
            model_preset="quality",
        )
        # Should match OPENAI_ANTHROPIC_MODELS cycling: Opus, GPT-high,
        # GPT-medium, Opus.
        expected = [
            Llm.CLAUDE_OPUS_4_6,
            Llm.GPT_5_2_CODEX_HIGH,
            Llm.GPT_5_2_CODEX_MEDIUM,
            Llm.CLAUDE_OPUS_4_6,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_preset_ignored_for_updates(self):
        """Updates intentionally use the fast 2-variant slate regardless of
        the user's preset, to keep iteration snappy and cheap."""
        models = await self.model_selector.select_models(
            generation_type="update",
            input_mode="text",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset="quality",
        )
        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GPT_5_4_2026_03_05_LOW,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_preset_ignored_for_video(self):
        """Video mode always uses the video Gemini slate, regardless of
        preset — presets are a UI preference, video is a technical
        constraint."""
        models = await self.model_selector.select_models(
            generation_type="create",
            input_mode="video",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset="fast",
        )
        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
        ]
        assert models == expected

    @pytest.mark.asyncio
    async def test_unknown_preset_falls_back_to_balanced(self):
        """Unknown preset keys must not crash generation; they silently fall
        back to the default slate (which is what the extraction stage does
        too, so the ModelSelectionStage shouldn't see unknown values in
        practice — but we test defense in depth)."""
        with_unknown = await self.model_selector.select_models(
            generation_type="create",
            input_mode="image",
            openai_api_key="key",
            anthropic_api_key="key",
            gemini_api_key="key",
            model_preset="does-not-exist",
        )
        # ``balanced`` is the default preset -> same as ALL_KEYS_MODELS_DEFAULT
        # but the extraction stage filters unknowns to None; here we pass
        # it directly, and the resolver still returns the default slate.
        # Because _get_variant_models only applies presets when
        # ``model_preset != DEFAULT_MODEL_PRESET``, an unknown preset name
        # falls through to the legacy code path, which for image+create
        # with all keys is ALL_KEYS_MODELS_DEFAULT.
        expected = [
            Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
            Llm.GPT_5_2_CODEX_HIGH,
            Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
            Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
        ]
        assert with_unknown == expected
