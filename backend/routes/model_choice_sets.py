from typing import Dict, Tuple

from llm import Llm

# Video variants always use Gemini.
VIDEO_VARIANT_MODELS = (
    Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
)

# All API keys available.

# Image (Create)

ALL_KEYS_MODELS_DEFAULT = (
    Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    Llm.GPT_5_2_CODEX_HIGH,
    Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
    Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
)

# Text (Create)

ALL_KEYS_MODELS_TEXT_CREATE = (
    Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    Llm.GPT_5_2_CODEX_HIGH,
    Llm.CLAUDE_OPUS_4_6,
    Llm.GEMINI_3_1_PRO_PREVIEW_LOW,
)

# Image + Text (Update)

ALL_KEYS_MODELS_UPDATE = (
    Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    Llm.GPT_5_4_2026_03_05_LOW,
)

# Key subset fallbacks.
GEMINI_ANTHROPIC_MODELS = (
    Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    Llm.GEMINI_3_1_PRO_PREVIEW_LOW,
    Llm.CLAUDE_OPUS_4_6,
    Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
    Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
)
GEMINI_OPENAI_MODELS = (
    Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    Llm.GEMINI_3_1_PRO_PREVIEW_LOW,
    Llm.GPT_5_2_CODEX_HIGH,
    Llm.GPT_5_2_CODEX_MEDIUM,
)
OPENAI_ANTHROPIC_MODELS = (
    Llm.CLAUDE_OPUS_4_6,
    Llm.GPT_5_2_CODEX_HIGH,
    Llm.GPT_5_2_CODEX_MEDIUM,
)
GEMINI_ONLY_MODELS = (
    Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
    Llm.GEMINI_3_1_PRO_PREVIEW_LOW,
    Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
    Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
)
ANTHROPIC_ONLY_MODELS = (
    Llm.CLAUDE_OPUS_4_6,
    Llm.CLAUDE_SONNET_4_6,
)
OPENAI_ONLY_MODELS = (
    Llm.GPT_5_2_CODEX_HIGH,
    Llm.GPT_5_2_CODEX_MEDIUM,
)


# --- Model presets ---
#
# Presets let the user pick a generation "mood" for the 4-variant create grid.
# They only apply when the user has all three provider API keys configured;
# otherwise we fall back to the existing key-subset logic so the app remains
# usable with partial credentials.
#
# Each preset is a tuple sized for the maximum create variant count (4). When
# fewer variants are requested we truncate; when more are requested we cycle.
#
# Design choices:
# - "balanced" mirrors the legacy ALL_KEYS_MODELS_DEFAULT so existing users
#   see no behavior change when they haven't picked a preset.
# - "fast" emphasizes Gemini Flash for snappy iteration.
# - "quality" leans on the slow-but-strong models; expect higher cost and
#   longer wait times.
# - "diverse" uses one model per provider/tier so the four mockups land in
#   visibly different design territory.
MODEL_PRESETS: Dict[str, Tuple[Llm, ...]] = {
    "balanced": ALL_KEYS_MODELS_DEFAULT,
    "fast": (
        Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
        Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
        Llm.GEMINI_3_FLASH_PREVIEW_MINIMAL,
        Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
    ),
    "quality": (
        Llm.CLAUDE_OPUS_4_6,
        Llm.GPT_5_2_CODEX_XHIGH,
        Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
        Llm.CLAUDE_OPUS_4_6,
    ),
    "diverse": (
        Llm.CLAUDE_OPUS_4_6,
        Llm.GPT_5_2_CODEX_HIGH,
        Llm.GEMINI_3_1_PRO_PREVIEW_HIGH,
        Llm.GEMINI_3_FLASH_PREVIEW_HIGH,
    ),
}

# Stable ordering for UIs and docs; keep in sync with frontend lib/models.ts.
MODEL_PRESET_ORDER: Tuple[str, ...] = ("balanced", "fast", "quality", "diverse")

DEFAULT_MODEL_PRESET = "balanced"


def resolve_preset_models(preset: str | None, num_variants: int) -> Tuple[Llm, ...]:
    """Return the ordered list of variant models for a preset.

    Unknown or missing presets fall back to ``balanced`` so a typo or schema
    drift never produces a generation error — worst case the user just gets
    the default slate. When fewer than ``num_variants`` models are defined
    we cycle to fill, matching the behavior of the legacy code path.
    """
    if num_variants <= 0:
        return ()

    key = preset if preset in MODEL_PRESETS else DEFAULT_MODEL_PRESET
    slate = MODEL_PRESETS[key]
    if not slate:
        # Defensive: an empty preset would be a programming error. Prefer a
        # working fallback over raising during a generation request.
        slate = MODEL_PRESETS[DEFAULT_MODEL_PRESET]

    return tuple(slate[i % len(slate)] for i in range(num_variants))


def is_known_preset(preset: str | None) -> bool:
    return preset in MODEL_PRESETS
