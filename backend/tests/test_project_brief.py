"""Unit tests for :mod:`prompts.project_brief`.

Covers the decision points that matter to the pipeline:

1. Empty / unknown contexts must return ``None`` so the pipeline knows to
   skip the brief entirely.
2. Meaningful contexts render the expected markdown sections.
3. Ordering and truncation don't leak implementation details to the LLM.
4. The alignment-rule footer is always present when a brief is rendered,
   because that's the whole reason the brief exists.
"""

from __future__ import annotations

import pytest

from context.models import (
    ComponentInfo,
    ComponentInput,
    ConventionsSummary,
    CssTokens,
    FrameworkInfo,
    PatternSignals,
    ProjectContext,
)
from prompts.project_brief import build_project_brief


def _make_context(**overrides):
    """Build a ProjectContext with minimal scaffolding, overriding fields per test."""
    framework = overrides.pop("framework", FrameworkInfo(name="unknown"))
    return ProjectContext(
        repo_path=overrides.pop("repo_path", "/tmp/project"),
        framework=framework,
        components=overrides.pop("components", []),
        css_tokens=overrides.pop("css_tokens", CssTokens()),
        patterns=overrides.pop("patterns", PatternSignals()),
        conventions=overrides.pop("conventions", ConventionsSummary()),
        files_scanned=overrides.pop("files_scanned", 0),
        truncated=overrides.pop("truncated", False),
        warnings=overrides.pop("warnings", []),
    )


def test_none_context_returns_none():
    assert build_project_brief(None) is None


def test_unknown_framework_and_no_signal_returns_none():
    context = _make_context()
    assert build_project_brief(context) is None


def test_unknown_framework_with_components_still_renders():
    """An empty framework but real components is worth surfacing.

    This mirrors partially-scanned repos where framework detection is noisy
    but the component scan found something useful.
    """
    context = _make_context(
        components=[
            ComponentInfo(
                name="AppButton",
                selector="app-button",
                file_path="src/app/shared/button.component.ts",
                kind="angular_component",
            )
        ],
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "app-button" in brief
    assert "Alignment rules" in brief


def test_framework_only_still_renders():
    """A recognized framework alone is useful guidance.

    The LLM should at least be told what framework the implementer targets,
    even if no components were scanned yet.
    """
    context = _make_context(
        framework=FrameworkInfo(name="angular", version="18", language="typescript"),
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "angular 18" in brief
    assert "typescript" in brief


def test_brief_starts_with_heading_and_ends_with_alignment_rules():
    """The alignment rule block is the behavioral payoff of the brief.

    If we ever drop it, the brief becomes a trivia dump instead of a nudge
    toward reusing existing tokens, which would defeat Round 6C's purpose.
    """
    context = _make_context(
        framework=FrameworkInfo(name="angular", language="typescript"),
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert brief.startswith("# Project alignment brief")
    assert brief.endswith(
        "If nothing above matches what the screenshot needs, fall through to the user's instructions — do not force a fit."
    )


def test_components_are_listed_with_selector_and_inputs():
    context = _make_context(
        framework=FrameworkInfo(name="angular", language="typescript"),
        components=[
            ComponentInfo(
                name="AppButton",
                selector="app-button",
                file_path="src/app/shared/button.component.ts",
                kind="angular_component",
                inputs=[
                    ComponentInput(name="label", kind="input", type="string", required=True),
                    ComponentInput(name="disabled", kind="input", type="boolean"),
                ],
            )
        ],
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "`<app-button>`" in brief
    assert "src/app/shared/button.component.ts" in brief
    assert "inputs: label, disabled" in brief


def test_components_without_selector_fall_back_to_name():
    context = _make_context(
        framework=FrameworkInfo(name="react", language="typescript"),
        components=[
            ComponentInfo(
                name="PrimaryButton",
                file_path="src/components/PrimaryButton.tsx",
                kind="react_component",
            )
        ],
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "`PrimaryButton`" in brief
    assert "`<PrimaryButton>`" not in brief, "non-Angular components shouldn't get a bogus selector"


def test_components_with_selector_are_listed_before_those_without():
    """Selector-bearing components are the strongest reuse signal.

    Ordering matters because we truncate to _MAX_COMPONENTS; if an
    unselected component were to push out a selected one, we'd be hiding
    the reusable UI from the LLM.
    """
    from prompts.project_brief import _MAX_COMPONENTS

    # Enough unselected components to fill the budget, plus one with a selector.
    filler = [
        ComponentInfo(
            name=f"Helper{i}",
            file_path=f"src/helpers/helper{i}.tsx",
            kind="react_component",
        )
        for i in range(_MAX_COMPONENTS + 3)
    ]
    with_selector = ComponentInfo(
        name="CoreButton",
        selector="core-button",
        file_path="src/core/core-button.component.ts",
        kind="angular_component",
    )
    context = _make_context(
        framework=FrameworkInfo(name="angular", language="typescript"),
        components=[*filler, with_selector],
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "`<core-button>`" in brief


def test_css_tokens_render_when_populated():
    context = _make_context(
        framework=FrameworkInfo(name="angular", language="typescript"),
        css_tokens=CssTokens(
            tailwind_colors={"primary": "#1D4ED8", "accent": "#F59E0B"},
            tailwind_custom_classes=["btn-primary", "card"],
            css_custom_properties={"--brand-space": "4px"},
            scss_variables={"spacing-sm": "4px"},
        ),
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "Design tokens to reuse" in brief
    assert "`primary`" in brief
    assert "`btn-primary`" in brief
    assert "`--brand-space`" in brief
    assert "`$spacing-sm`" in brief


def test_css_tokens_absent_when_empty():
    context = _make_context(framework=FrameworkInfo(name="angular", language="typescript"))
    brief = build_project_brief(context)
    assert brief is not None
    assert "Design tokens to reuse" not in brief, (
        "empty tokens shouldn't emit an empty header — the brief must stay tight"
    )


def test_patterns_and_conventions_render_when_populated():
    context = _make_context(
        framework=FrameworkInfo(name="angular", language="typescript"),
        patterns=PatternSignals(
            state_style="signals",
            rendering_style="template",
            angular_standalone=True,
            angular_zoneless=True,
        ),
        conventions=ConventionsSummary(
            naming_style="kebab-case",
            template_style="external .html",
            folder_layout=["src/app/shared", "src/app/features"],
            import_style="alias @/*",
        ),
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "signals state" in brief
    assert "zoneless" in brief
    assert "naming: kebab-case" in brief
    assert "`src/app/shared`" in brief


def test_brief_respects_length_cap():
    """A pathological context must not push the system prompt over budget.

    We construct a context with lots of components and tokens and assert the
    rendered brief is truncated at the documented cap with an ellipsis.
    """
    from prompts.project_brief import _MAX_BRIEF_CHARS

    many_components = [
        ComponentInfo(
            name=f"Component{i}",
            selector=f"app-component-{i}",
            file_path=f"src/app/components/component-{i}.component.ts"
            + " " * 200,  # pad path to force overflow
            kind="angular_component",
        )
        for i in range(50)
    ]
    context = _make_context(
        framework=FrameworkInfo(name="angular", language="typescript"),
        components=many_components,
        css_tokens=CssTokens(
            tailwind_colors={f"color{i}": f"#{i:06x}" for i in range(50)},
            tailwind_custom_classes=[f"cls-{i}" for i in range(50)],
        ),
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert len(brief) <= _MAX_BRIEF_CHARS
    assert brief.endswith("…"), "truncated brief should end with an ellipsis"


def test_tailwind_nested_color_map_renders_top_level_names_only():
    """Tailwind allows ``primary: { 500: ..., 700: ... }``. We only surface the
    top-level key to keep the line readable; the implementer can request a
    shade later if needed. This test pins that behavior so a well-meaning
    refactor doesn't start dumping shade maps into the prompt.
    """
    context = _make_context(
        framework=FrameworkInfo(name="angular", language="typescript"),
        css_tokens=CssTokens(
            tailwind_colors={
                "primary": {"500": "#1D4ED8", "700": "#1E3A8A"},
                "accent": "#F59E0B",
            }
        ),
    )
    brief = build_project_brief(context)
    assert brief is not None
    assert "`primary`" in brief
    assert "`accent`" in brief
    assert "500" not in brief
    assert "1D4ED8" not in brief


@pytest.mark.parametrize(
    "framework_name,expected_fragment",
    [
        ("angular", "angular"),
        ("react", "react"),
        ("vue", "vue"),
        ("svelte", "svelte"),
        ("next", "next"),
        ("plain_html", "plain_html"),
    ],
)
def test_known_framework_names_render(framework_name, expected_fragment):
    context = _make_context(framework=FrameworkInfo(name=framework_name, language="typescript"))
    brief = build_project_brief(context)
    assert brief is not None
    assert expected_fragment in brief
