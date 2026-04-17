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
            state_style=state_style,
        ),
        css_tokens=CssTokens(
            scss_variables=scss_variables or {},
            tailwind_custom_classes=tailwind_custom_classes or [],
        ),
        conventions=ConventionsSummary(naming_style=naming_style),
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
