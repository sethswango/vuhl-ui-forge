from __future__ import annotations

from pathlib import Path

from context import scan_project_context


FIXTURES = Path(__file__).parent / "fixtures" / "project_context"


def test_angular_signals_fixture_is_classified() -> None:
    project = scan_project_context(FIXTURES / "angular_signals")

    assert project.framework.name == "angular"
    assert project.framework.version is not None
    assert project.framework.language == "typescript"
    assert "angular.json" in project.framework.evidence

    selectors = {c.selector for c in project.components}
    assert "app-card" in selectors
    assert "app-list" in selectors

    card = next(c for c in project.components if c.name == "CardComponent")
    input_names = {i.name for i in card.inputs}
    assert "title" in input_names
    assert "description" in input_names
    description_input = next(i for i in card.inputs if i.name == "description")
    assert description_input.required is True
    assert description_input.kind == "input"

    assert project.patterns.uses_signals is True
    assert project.patterns.uses_rxjs is False
    assert project.patterns.state_style == "signals"
    assert project.patterns.rendering_style == "template"
    assert project.patterns.angular_standalone is True

    assert project.css_tokens.tailwind_config_path is not None
    assert project.css_tokens.tailwind_colors.get("primary") == "#2E7D32"
    assert project.css_tokens.css_custom_properties.get("--color-accent") is not None
    assert any("styles.scss" in src for src in project.css_tokens.token_sources)
    assert project.css_tokens.scss_variables.get("$brand-radius") is not None

    assert any("shared" in folder for folder in project.conventions.folder_layout)


def test_react_hooks_fixture_is_classified() -> None:
    project = scan_project_context(FIXTURES / "react_hooks")

    assert project.framework.name == "react"
    assert project.framework.language == "typescript"
    assert project.patterns.uses_hooks is True
    assert project.patterns.uses_signals is False
    assert project.patterns.state_style == "hooks"
    assert project.patterns.rendering_style == "jsx"

    names = {c.name for c in project.components}
    assert "Card" in names
    assert "ItemList" in names

    card = next(c for c in project.components if c.name == "Card")
    prop_names = {p.name for p in card.inputs}
    assert "title" in prop_names
    assert "description" in prop_names
    title_prop = next(p for p in card.inputs if p.name == "title")
    assert title_prop.kind == "prop"
    assert title_prop.required is True

    assert project.css_tokens.css_custom_properties.get("--color-accent") is not None


def test_vue_composition_fixture_is_classified() -> None:
    project = scan_project_context(FIXTURES / "vue_composition")

    assert project.framework.name == "vue"
    assert project.patterns.uses_composition_api is True
    assert project.patterns.state_style == "composition"
    assert project.patterns.rendering_style == "sfc"

    names = {c.name for c in project.components}
    assert "PriceCard" in names or "ItemList" in names

    assert project.css_tokens.css_custom_properties.get("--color-primary") is not None


def test_plain_html_fixture_is_classified() -> None:
    project = scan_project_context(FIXTURES / "plain_html")

    assert project.framework.name == "plain_html"
    assert project.patterns.state_style == "classic"
    assert project.patterns.rendering_style == "plain_html"
    assert project.css_tokens.css_custom_properties.get("--color-ink") is not None
    assert project.components == []


def test_scanner_respects_file_budget(tmp_path) -> None:
    """Sanity check that max_files truncation does not crash the scanner."""
    target = Path(tmp_path) / "mini"
    target.mkdir()
    (target / "package.json").write_text('{"dependencies":{"react":"^18.0.0"}}')
    (target / "a.tsx").write_text(
        "export const A = () => <div className='card'>a</div>;"
    )
    (target / "b.tsx").write_text(
        "export const B = () => <div className='card'>b</div>;"
    )
    project = scan_project_context(target, max_files=1)
    assert project.framework.name == "react"
    assert project.files_scanned == 1
    assert project.truncated is True


def test_scanner_raises_on_missing_path(tmp_path) -> None:
    missing = Path(tmp_path) / "does-not-exist"
    try:
        scan_project_context(missing)
    except FileNotFoundError:
        return
    raise AssertionError("scan_project_context should raise when path is missing")


# -------------------------------------------------- Round 12: pattern signals
#
# OnPush, modern vs legacy control flow, and React memo usage are the three
# functional-correctness signals that make downstream implementer guidance
# concrete rather than advisory. Keep these tiny synthetic fixtures fast.


def _make_angular_project(tmp_path: Path) -> Path:
    root = Path(tmp_path) / "ng"
    root.mkdir()
    (root / "package.json").write_text(
        '{"dependencies":{"@angular/core":"^17.0.0","@angular/common":"^17.0.0"}}'
    )
    (root / "angular.json").write_text("{}")
    (root / "src").mkdir()
    return root


def test_scanner_detects_on_push_change_detection(tmp_path) -> None:
    root = _make_angular_project(tmp_path)
    (root / "src" / "card.component.ts").write_text(
        "import { Component, ChangeDetectionStrategy } from '@angular/core';\n"
        "@Component({\n"
        "  selector: 'app-card',\n"
        "  standalone: true,\n"
        "  changeDetection: ChangeDetectionStrategy.OnPush,\n"
        "  templateUrl: './card.component.html',\n"
        "})\n"
        "export class CardComponent {}\n"
    )

    project = scan_project_context(root)
    assert project.framework.name == "angular"
    assert project.patterns.angular_on_push is True


def test_scanner_defaults_angular_on_push_to_false_when_components_lack_it(
    tmp_path,
) -> None:
    root = _make_angular_project(tmp_path)
    (root / "src" / "plain.component.ts").write_text(
        "import { Component } from '@angular/core';\n"
        "@Component({ selector: 'app-plain', standalone: true, template: '<p>hi</p>' })\n"
        "export class PlainComponent {}\n"
    )

    project = scan_project_context(root)
    assert project.framework.name == "angular"
    assert project.patterns.angular_on_push is False


def test_scanner_detects_modern_control_flow(tmp_path) -> None:
    root = _make_angular_project(tmp_path)
    (root / "src" / "list.component.ts").write_text(
        "import { Component } from '@angular/core';\n"
        "@Component({ selector: 'app-list', standalone: true, templateUrl: './list.component.html' })\n"
        "export class ListComponent { items = [1,2,3]; }\n"
    )
    (root / "src" / "list.component.html").write_text(
        "<ul>@for (item of items; track item) { <li>{{ item }}</li> }</ul>\n"
        "@if (items.length === 0) { <p>empty</p> }\n"
    )

    project = scan_project_context(root)
    assert project.patterns.angular_control_flow == "modern"


def test_scanner_detects_legacy_control_flow(tmp_path) -> None:
    root = _make_angular_project(tmp_path)
    (root / "src" / "list.component.ts").write_text(
        "import { Component } from '@angular/core';\n"
        "@Component({ selector: 'app-list', standalone: true, templateUrl: './list.component.html' })\n"
        "export class ListComponent { items = [1,2,3]; }\n"
    )
    (root / "src" / "list.component.html").write_text(
        "<ul><li *ngFor=\"let item of items\">{{ item }}</li></ul>\n"
        "<p *ngIf=\"items.length === 0\">empty</p>\n"
    )

    project = scan_project_context(root)
    assert project.patterns.angular_control_flow == "legacy"


def test_scanner_detects_mixed_control_flow(tmp_path) -> None:
    root = _make_angular_project(tmp_path)
    (root / "src" / "legacy.component.html").write_text(
        "<ul><li *ngFor=\"let item of items\">{{ item }}</li></ul>\n"
    )
    (root / "src" / "modern.component.html").write_text(
        "<ul>@for (item of items; track item) { <li>{{ item }}</li> }</ul>\n"
    )

    project = scan_project_context(root)
    assert project.patterns.angular_control_flow == "mixed"


def test_scanner_detects_react_memo(tmp_path) -> None:
    root = Path(tmp_path) / "rr"
    root.mkdir()
    (root / "package.json").write_text('{"dependencies":{"react":"^18.0.0"}}')
    (root / "src").mkdir()
    (root / "src" / "Row.tsx").write_text(
        "import { memo, useCallback, useMemo } from 'react';\n"
        "export const Row = React.memo(({ id, label, onSelect }) => {\n"
        "  const formatted = useMemo(() => label.toUpperCase(), [label]);\n"
        "  const handle = useCallback(() => onSelect(id), [id, onSelect]);\n"
        "  return <li onClick={handle}>{formatted}</li>;\n"
        "});\n"
    )

    project = scan_project_context(root)
    assert project.framework.name == "react"
    assert project.patterns.uses_react_memo is True


def test_scanner_evidence_lists_new_signals(tmp_path) -> None:
    root = _make_angular_project(tmp_path)
    (root / "src" / "card.component.ts").write_text(
        "import { Component, ChangeDetectionStrategy } from '@angular/core';\n"
        "@Component({\n"
        "  selector: 'app-card',\n"
        "  standalone: true,\n"
        "  changeDetection: ChangeDetectionStrategy.OnPush,\n"
        "  templateUrl: './card.component.html',\n"
        "})\n"
        "export class CardComponent {}\n"
    )
    (root / "src" / "card.component.html").write_text(
        "<div>@if (ready) { <p>hi</p> }</div>\n"
    )

    project = scan_project_context(root)
    evidence_joined = " | ".join(project.patterns.evidence)
    assert "OnPush" in evidence_joined
    assert "modern=" in evidence_joined or "modern=1" in evidence_joined
