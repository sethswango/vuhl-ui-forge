"""Unit tests for the pure model preset helpers.

These tests exercise ``resolve_preset_models`` and ``is_known_preset`` in
isolation from the ModelSelectionStage pipeline. They lock down the
public contract — cycling, fallback behavior, and the stable ordering of
the preset list — so downstream UIs can depend on it.
"""

from llm import Llm
from routes.model_choice_sets import (
    DEFAULT_MODEL_PRESET,
    MODEL_PRESET_ORDER,
    MODEL_PRESETS,
    is_known_preset,
    resolve_preset_models,
)


def test_default_preset_is_a_known_preset():
    """The default must itself be a valid preset; otherwise the fallback
    logic would be circular."""
    assert DEFAULT_MODEL_PRESET in MODEL_PRESETS


def test_preset_order_covers_every_preset_exactly_once():
    """``MODEL_PRESET_ORDER`` is the canonical UI-facing list. Any preset
    we define must appear in it exactly once so dropdowns stay stable
    and complete."""
    assert set(MODEL_PRESET_ORDER) == set(MODEL_PRESETS.keys())
    assert len(MODEL_PRESET_ORDER) == len(MODEL_PRESETS)


def test_resolve_returns_tuple_of_exact_length():
    models = resolve_preset_models("balanced", 4)
    assert isinstance(models, tuple)
    assert len(models) == 4
    assert all(isinstance(m, Llm) for m in models)


def test_resolve_truncates_when_fewer_variants_requested():
    """Requesting 2 variants should return the first 2 slots of the
    preset, not silently inflate the grid."""
    four = resolve_preset_models("diverse", 4)
    two = resolve_preset_models("diverse", 2)
    assert len(two) == 2
    assert two == four[:2]


def test_resolve_cycles_when_more_variants_requested():
    """Asking for more variants than the preset defines must cycle rather
    than raising or returning an undersized tuple."""
    models = resolve_preset_models("fast", 6)
    assert len(models) == 6
    # Preset 'fast' has 4 slots; index 4 should wrap back to index 0.
    assert models[4] == models[0]
    assert models[5] == models[1]


def test_resolve_zero_variants_returns_empty_tuple():
    assert resolve_preset_models("balanced", 0) == ()


def test_resolve_unknown_preset_falls_back_to_default():
    """Typos or schema drift must never produce an empty slate —
    the helper is expected to silently fall back to the default."""
    unknown = resolve_preset_models("definitely-not-a-preset", 4)
    default = resolve_preset_models(DEFAULT_MODEL_PRESET, 4)
    assert unknown == default


def test_resolve_none_preset_falls_back_to_default():
    assert resolve_preset_models(None, 4) == resolve_preset_models(
        DEFAULT_MODEL_PRESET, 4
    )


def test_is_known_preset_accepts_registered_values_only():
    for preset in MODEL_PRESETS:
        assert is_known_preset(preset)
    assert not is_known_preset("")
    assert not is_known_preset(None)
    assert not is_known_preset("unknown")


def test_quality_preset_contains_at_least_one_opus_slot():
    """'quality' is the user-facing "premium" preset; an Opus-free quality
    preset would be a clear regression and breaks the preset's promise."""
    quality = resolve_preset_models("quality", 4)
    assert Llm.CLAUDE_OPUS_4_6 in quality
