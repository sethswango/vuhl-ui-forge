from __future__ import annotations

from pathlib import Path

from context import scan_project_context
from context.models import (
    ConventionsSummary,
    CssTokens,
    FrameworkInfo,
    PatternSignals,
    ProjectContext,
)
from spec import extract_design_spec


FIXTURES = Path(__file__).parent / "fixtures" / "project_context"


FIXTURE_HTML = """
<body>
  <main class="surface" role="main">
    <header>
      <h1>Fee Comparison</h1>
    </header>
    <section class="card" aria-expanded="false">
      <h2 style="color:#2E7D32">Summary</h2>
      <p>Compare fees across partners.</p>
      <button onclick="doSave()">Save</button>
    </section>
    <form>
      <label>Name <input name="contact" type="text" /></label>
      <button type="submit">Send</button>
    </form>
    <ul>
      <li>One</li>
      <li>Two</li>
      <li>Three</li>
    </ul>
  </main>
</body>
"""


def test_extract_spec_with_angular_project_context() -> None:
    project = scan_project_context(FIXTURES / "angular_signals")

    document = extract_design_spec(
        session_id="session-1",
        variant_index=0,
        html=FIXTURE_HTML,
        model="claude-opus-4-5",
        project_context=project,
    )

    spec = document.spec
    assert spec.session_id == "session-1"
    assert spec.variant_index == 0
    assert spec.project_context_used is True
    assert spec.project_context_fingerprint is not None
    assert spec.component_tree.tag == "body"

    token_classes = set(spec.tokens_used.tailwind_classes)
    assert "card" in token_classes
    assert "surface" in token_classes
    assert "#2E7D32" in spec.tokens_used.colors

    reused_names = {s.component_name for s in spec.reuse_suggestions}
    assert "CardComponent" in reused_names

    card_reuse = next(s for s in spec.reuse_suggestions if s.component_name == "CardComponent")
    assert card_reuse.component_selector == "app-card"
    assert card_reuse.component_file is not None
    assert card_reuse.component_file.endswith("card.component.ts")

    joined_notes = "\n".join(spec.alignment_notes)
    assert "signals" in joined_notes.lower()
    assert "var(--" in joined_notes or "custom properties" in joined_notes.lower()
    assert "standalone" in joined_notes.lower()
    assert "@for" in joined_notes or "*ngFor" in joined_notes
    assert "Align better than the spec did" in joined_notes

    events = {(b.element, b.event) for b in spec.event_bindings}
    assert ("button", "click") in events
    assert ("form", "submit") in events

    state_kinds = {hint.kind for hint in spec.state_hints}
    assert "form_input" in state_kinds
    assert "list" in state_kinds
    assert "toggle" in state_kinds

    markdown = document.annotated_markdown
    assert markdown.startswith("# Implementer Handoff")
    assert "app-card" in markdown
    assert "CardComponent" in markdown or "app-card" in markdown
    assert "Align with project patterns" in markdown
    assert "Reuse existing components" in markdown
    assert "Implementer checklist" in markdown
    assert "session-1" in markdown


def test_extract_spec_without_project_context_uses_fallback() -> None:
    document = extract_design_spec(
        session_id="session-fallback",
        variant_index=2,
        html="<body><section class='card'><h2 style='color:#2E7D32'>Hi</h2></section></body>",
        model="gemini-3-flash",
        project_context=None,
    )
    spec = document.spec
    assert spec.project_context_used is False
    assert spec.reuse_suggestions == []
    assert spec.new_components_needed == []
    assert any(
        "gather_project_context" in note for note in spec.alignment_notes
    )
    assert "generic placeholders" in "\n".join(spec.alignment_notes)

    markdown = document.annotated_markdown
    assert "no project context" in markdown.lower()
    assert "gather_project_context" in markdown


def test_extract_spec_golden_shape() -> None:
    document = extract_design_spec(
        session_id="session-golden",
        variant_index=1,
        html=(
            "<body><section class='card'><h2>Title</h2>"
            "<button onclick='x()'>Go</button></section></body>"
        ),
        model="gpt-5.4",
        project_context=None,
    )
    payload = document.to_payload()
    assert payload["spec"]["session_id"] == "session-golden"
    assert payload["spec"]["variant_index"] == 1
    assert payload["spec"]["component_tree"]["tag"] == "body"
    assert payload["spec"]["component_tree"]["children"][0]["tag"] == "section"
    assert (
        payload["annotated_markdown"].startswith("# Implementer Handoff")
    )
    assert payload["spec"]["project_context_used"] is False


def test_extract_spec_with_react_project_context() -> None:
    project = scan_project_context(FIXTURES / "react_hooks")

    document = extract_design_spec(
        session_id="session-react",
        variant_index=0,
        html=FIXTURE_HTML,
        model="claude-4.6-opus",
        project_context=project,
    )

    joined_notes = "\n".join(document.spec.alignment_notes).lower()
    assert "react hooks" in joined_notes or "usestate" in joined_notes
    assert ".map(" in joined_notes or "stable" in joined_notes
    assert "controlled" in joined_notes or "form" in joined_notes


def test_extract_spec_with_vue_project_context() -> None:
    project = scan_project_context(FIXTURES / "vue_composition")

    document = extract_design_spec(
        session_id="session-vue",
        variant_index=0,
        html=FIXTURE_HTML,
        model="claude-4.6-opus",
        project_context=project,
    )

    joined_notes = "\n".join(document.spec.alignment_notes).lower()
    assert "composition api" in joined_notes or "ref()" in joined_notes
    assert "v-for" in joined_notes
    assert "v-model" in joined_notes


def _synthetic_angular_context(
    *,
    uses_signals: bool = False,
    uses_rxjs: bool = False,
    uses_observables: bool = False,
    angular_zoneless: bool = False,
    angular_on_push: bool | None = None,
    angular_control_flow: str | None = None,
    state_style: str | None = None,
    naming_style: str | None = None,
    scss_variables: dict[str, str] | None = None,
    tailwind_custom_classes: list[str] | None = None,
) -> ProjectContext:
    return ProjectContext(
        repo_path="synthetic://angular",
        framework=FrameworkInfo(name="angular", language="typescript"),
        patterns=PatternSignals(
            uses_signals=uses_signals,
            uses_rxjs=uses_rxjs,
            uses_observables=uses_observables,
            angular_zoneless=angular_zoneless,
            angular_standalone=True,
            angular_on_push=angular_on_push,
            angular_control_flow=angular_control_flow,
            state_style=state_style,
        ),
        css_tokens=CssTokens(
            scss_variables=scss_variables or {},
            tailwind_custom_classes=tailwind_custom_classes or [],
        ),
        conventions=ConventionsSummary(naming_style=naming_style),
    )


def _synthetic_react_context(
    *,
    uses_hooks: bool = True,
    uses_react_memo: bool = False,
    state_style: str | None = "hooks",
) -> ProjectContext:
    return ProjectContext(
        repo_path="synthetic://react",
        framework=FrameworkInfo(name="react", language="typescript"),
        patterns=PatternSignals(
            uses_hooks=uses_hooks,
            uses_react_memo=uses_react_memo,
            state_style=state_style,
        ),
    )


def test_signals_plus_rxjs_emits_interop_guidance() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, uses_rxjs=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-interop",
        variant_index=0,
        html="<body><ul><li>A</li><li>B</li></ul></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "tosignal" in joined or "toobservable" in joined
    assert "signals + rxjs" in joined or "interop" in joined


def test_zoneless_guidance_surfaces_when_project_is_zoneless() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, angular_zoneless=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-zoneless",
        variant_index=0,
        html="<body><button onclick='x()'>Go</button></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "zoneless" in joined


def test_scss_variables_surface_in_token_notes() -> None:
    project = _synthetic_angular_context(
        uses_signals=True,
        state_style="signals",
        scss_variables={"$brand-primary": "#004990", "$spacing-md": "16px"},
    )

    document = extract_design_spec(
        session_id="session-scss",
        variant_index=0,
        html="<body><h2 style='color:#004990'>Hi</h2></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "scss" in joined
    assert "$brand-primary" in joined or "$spacing-md" in joined


def test_naming_convention_note_surfaces_when_present() -> None:
    project = _synthetic_angular_context(
        uses_signals=True,
        state_style="signals",
        naming_style="kebab-case files, PascalCase components",
    )

    document = extract_design_spec(
        session_id="session-naming",
        variant_index=0,
        html="<body><div class='card'>Hi</div></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "naming" in joined
    assert "pascalcase" in joined or "kebab-case" in joined


def test_alignment_notes_are_deduplicated() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-dupes",
        variant_index=0,
        html=FIXTURE_HTML,
        project_context=project,
    )

    notes = document.spec.alignment_notes
    assert len(notes) == len(set(notes)), "alignment notes should be deduped"


def test_reused_component_is_not_also_listed_as_new_component() -> None:
    """Regression: when a card-class section matches CardComponent for reuse,
    we must not also list `card` under "new components needed" in the handoff."""
    project = scan_project_context(FIXTURES / "angular_signals")

    html = (
        "<body><main>"
        "<section class='card p-4' aria-expanded='false'>"
        "<h2>Title</h2><p>Body</p>"
        "</section>"
        "</main></body>"
    )

    document = extract_design_spec(
        session_id="session-dup",
        variant_index=0,
        html=html,
        project_context=project,
    )

    reused = {s.component_name for s in document.spec.reuse_suggestions}
    assert "CardComponent" in reused
    assert "card" not in document.spec.new_components_needed
    assert not any(
        "card" == needed.lower() for needed in document.spec.new_components_needed
    )


def test_signals_form_note_prefers_signal_backed_forms() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-forms",
        variant_index=0,
        html=(
            "<body><form><input type='text' name='email'></form></body>"
        ),
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "signal-backed" in joined or "tosignal" in joined


# -------------------------------------------------- Round 12: functional depth
#
# The following tests lock in the "self-documenting, functionally-aware"
# guarantees of the spec output: OnPush change-detection guidance, stable
# `track`/`trackBy`/`key` requirements for every list path, React re-render
# budget hints, a11y keyboard follow-through for toggles, virtualization for
# large hand-written lists, and the prominence of the self-documentation
# banner + non-negotiables block in the markdown handoff.


def test_on_push_project_surfaces_mandatory_on_push_note() -> None:
    project = _synthetic_angular_context(
        uses_signals=True,
        state_style="signals",
        angular_on_push=True,
    )

    document = extract_design_spec(
        session_id="session-onpush",
        variant_index=0,
        html="<body><section class='card'><h2>Hi</h2></section></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes)
    assert "OnPush" in joined
    assert "MUST declare" in joined or "must declare" in joined.lower()


def test_signals_without_detected_on_push_recommends_adding_it() -> None:
    project = _synthetic_angular_context(
        uses_signals=True,
        state_style="signals",
        angular_on_push=False,
    )

    document = extract_design_spec(
        session_id="session-signals-no-onpush",
        variant_index=0,
        html="<body><section class='card'><h2>Hi</h2></section></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes)
    assert "OnPush" in joined
    assert "pair signals" in joined.lower() or "only reliably" in joined.lower()


def test_legacy_control_flow_emits_ngFor_trackBy_guidance() -> None:
    project = _synthetic_angular_context(
        uses_signals=False,
        state_style="classic",
        angular_control_flow="legacy",
    )

    document = extract_design_spec(
        session_id="session-legacy-cf",
        variant_index=0,
        html="<body><ul><li>A</li><li>B</li><li>C</li></ul></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes)
    assert "*ngFor" in joined
    assert "trackBy" in joined


def test_modern_control_flow_with_signals_uses_track_id() -> None:
    project = _synthetic_angular_context(
        uses_signals=True,
        state_style="signals",
        angular_control_flow="modern",
    )

    document = extract_design_spec(
        session_id="session-modern-cf",
        variant_index=0,
        html="<body><ul><li>A</li><li>B</li><li>C</li></ul></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes)
    assert "@for" in joined
    assert "track item.id" in joined


def test_mixed_control_flow_asks_implementer_to_match_surroundings() -> None:
    project = _synthetic_angular_context(
        uses_signals=True,
        state_style="signals",
        angular_control_flow="mixed",
    )

    document = extract_design_spec(
        session_id="session-mixed-cf",
        variant_index=0,
        html="<body><ul><li>A</li><li>B</li><li>C</li></ul></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "mixes modern" in joined or "match the style" in joined
    assert "@for" in joined or "ngfor" in joined


def test_react_memo_project_gets_rerender_budget_note() -> None:
    project = _synthetic_react_context(
        uses_hooks=True, uses_react_memo=True, state_style="hooks"
    )

    document = extract_design_spec(
        session_id="session-react-memo",
        variant_index=0,
        html="<body><section class='card'><h2>Hi</h2></section></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes)
    assert "React.memo" in joined or "re-render budget" in joined.lower()
    assert "useCallback" in joined or "memoize" in joined.lower()


def test_react_without_memo_does_not_mention_react_memo() -> None:
    project = _synthetic_react_context(
        uses_hooks=True, uses_react_memo=False, state_style="hooks"
    )

    document = extract_design_spec(
        session_id="session-react-no-memo",
        variant_index=0,
        html="<body><section class='card'><h2>Hi</h2></section></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes)
    assert "React.memo" not in joined
    assert "Re-render budget" not in joined


def test_toggle_elements_get_keyboard_a11y_note() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-toggle",
        variant_index=0,
        html=(
            "<body><button aria-pressed='false'>Toggle</button>"
            "<div aria-expanded='true'>Panel</div></body>"
        ),
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes)
    assert "Keyboard a11y" in joined or "keyboard" in joined.lower()
    assert "Space" in joined and "Enter" in joined


def test_large_list_triggers_virtualization_note() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )
    # 10 children — above the 8-child threshold for virtualization guidance.
    items = "".join(f"<li>Item {i}</li>" for i in range(10))

    document = extract_design_spec(
        session_id="session-big-list",
        variant_index=0,
        html=f"<body><ul>{items}</ul></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "virtual" in joined
    assert "cdk-virtual" in joined or "react-window" in joined


def test_small_list_does_not_trigger_virtualization_note() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-small-list",
        variant_index=0,
        html="<body><ul><li>A</li><li>B</li><li>C</li></ul></body>",
        project_context=project,
    )

    joined = "\n".join(document.spec.alignment_notes).lower()
    assert "virtual" not in joined


def test_markdown_contains_self_documentation_banner() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-banner",
        variant_index=0,
        html="<body><section class='card'>Hi</section></body>",
        project_context=project,
    )

    markdown = document.annotated_markdown
    assert "Project patterns outrank" in markdown
    assert "push the implementation" in markdown.lower() or "push" in markdown.lower()


def test_markdown_contains_non_negotiables_section() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-nonneg",
        variant_index=0,
        html="<body><button onclick='x()'>Go</button></body>",
        project_context=project,
    )

    markdown = document.annotated_markdown
    assert "## Non-negotiables" in markdown
    assert "Reuse existing components" in markdown
    assert "No inline event handlers" in markdown
    assert "No hand-written list duplication" in markdown
    assert "Tokens over literals" in markdown
    assert "Preserve accessibility" in markdown


def test_non_negotiables_section_appears_before_align_with_project_patterns() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-order",
        variant_index=0,
        html="<body><section>Hi</section></body>",
        project_context=project,
    )

    markdown = document.annotated_markdown
    non_neg_idx = markdown.find("## Non-negotiables")
    align_idx = markdown.find("## Align with project patterns")
    assert non_neg_idx >= 0 and align_idx >= 0
    assert non_neg_idx < align_idx, (
        "Non-negotiables must precede alignment notes so implementer agents"
        " internalize the rules before reading detailed guidance."
    )


def test_checklist_includes_on_push_for_signals_angular() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-checklist-onpush",
        variant_index=0,
        html="<body><section>Hi</section></body>",
        project_context=project,
    )

    markdown = document.annotated_markdown
    checklist_start = markdown.find("## Implementer checklist")
    assert checklist_start > 0
    checklist = markdown[checklist_start:]
    assert "ChangeDetectionStrategy.OnPush" in checklist
    assert "standalone: true" in checklist


def test_checklist_includes_react_memo_when_project_uses_it() -> None:
    project = _synthetic_react_context(
        uses_hooks=True, uses_react_memo=True, state_style="hooks"
    )

    document = extract_design_spec(
        session_id="session-checklist-memo",
        variant_index=0,
        html="<body><section>Hi</section></body>",
        project_context=project,
    )

    markdown = document.annotated_markdown
    checklist = markdown[markdown.find("## Implementer checklist"):]
    assert "useCallback" in checklist or "React.memo" in checklist


def test_checklist_includes_keyboard_when_toggles_present() -> None:
    project = _synthetic_angular_context(
        uses_signals=True, state_style="signals"
    )

    document = extract_design_spec(
        session_id="session-checklist-kb",
        variant_index=0,
        html="<body><button aria-pressed='false'>Toggle</button></body>",
        project_context=project,
    )

    markdown = document.annotated_markdown
    checklist = markdown[markdown.find("## Implementer checklist"):]
    assert "Space" in checklist and "Enter" in checklist


def test_checklist_without_project_context_stays_minimal() -> None:
    document = extract_design_spec(
        session_id="session-checklist-nocontext",
        variant_index=0,
        html="<body><section>Hi</section></body>",
        project_context=None,
    )

    markdown = document.annotated_markdown
    checklist = markdown[markdown.find("## Implementer checklist"):]
    # Without a project context we should not speculate about OnPush,
    # memoization, or standalone — those are framework-conditional.
    assert "ChangeDetectionStrategy.OnPush" not in checklist
    assert "React.memo" not in checklist
    assert "standalone: true" not in checklist
