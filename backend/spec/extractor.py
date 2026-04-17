"""HTML variant → dual-format design spec.

The extractor consumes an HTML string (from a recorded variant) plus an
optional :class:`ProjectContext` and produces:

- a structured :class:`DesignSpec` with component tree, tokens, bindings, and
  reuse suggestions keyed to the project;
- an annotated markdown companion that reads as a handoff prompt for an
  implementer agent.

The annotations are the "secret sauce": they're the instructions that push a
downstream agent toward framework-idiomatic code instead of generic HTML.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, Iterator, List, Optional, Tuple, cast

from bs4 import BeautifulSoup, Tag
from bs4.element import PageElement

from context.models import ComponentInfo, ProjectContext

from .models import (
    ComponentNode,
    DesignSpec,
    EventBinding,
    ReuseSuggestion,
    SpecDocument,
    StateHint,
    TokenUsage,
)


_HEX_COLOR_RE = re.compile(r"#(?:[0-9a-fA-F]{3}){1,2}\b")
_RGB_COLOR_RE = re.compile(r"rgb[a]?\([^)]+\)")
_CUSTOM_PROP_RE = re.compile(r"var\(--([a-zA-Z0-9_-]+)\)")
_PX_RE = re.compile(r"\b\d+px\b")
_FONT_RE = re.compile(r"font-family\s*:\s*([^;}]+)")
_ATTR_EVENTS = (
    "onclick",
    "onchange",
    "oninput",
    "onsubmit",
    "onkeydown",
    "onkeyup",
    "onblur",
    "onfocus",
    "onmouseenter",
    "onmouseleave",
)


def extract_design_spec(
    *,
    session_id: str,
    variant_index: int,
    html: str,
    model: Optional[str] = None,
    project_context: Optional[ProjectContext] = None,
) -> SpecDocument:
    soup = BeautifulSoup(html or "", "html.parser")
    body = cast(Any, soup.find("body"))
    if isinstance(body, Tag):
        root: Tag = body
    else:
        root = cast(Tag, soup.new_tag("div"))

    component_tree, tokens, bindings, state_hints = _walk(root)

    reuse_suggestions: List[ReuseSuggestion] = []
    new_components: List[str] = []
    alignment_notes: List[str] = []
    if project_context is not None:
        reuse_suggestions, new_components = _suggest_reuses(
            component_tree, project_context
        )
        alignment_notes = _alignment_notes(project_context, tokens, bindings, state_hints)
    else:
        alignment_notes = _generic_alignment_notes(tokens, bindings, state_hints)

    summary = _summary_line(component_tree, tokens, project_context)

    spec = DesignSpec(
        session_id=session_id,
        variant_index=variant_index,
        model=model,
        summary=summary,
        component_tree=component_tree,
        tokens_used=tokens,
        event_bindings=bindings,
        state_hints=state_hints,
        reuse_suggestions=reuse_suggestions,
        new_components_needed=new_components,
        alignment_notes=alignment_notes,
        project_context_used=project_context is not None,
        project_context_fingerprint=_context_fingerprint(project_context),
    )

    markdown = _render_markdown(spec, project_context=project_context)
    return SpecDocument(spec=spec, annotated_markdown=markdown)


# --------------------------------------------------------------------------- walk

def _walk(root: Tag) -> Tuple[ComponentNode, TokenUsage, List[EventBinding], List[StateHint]]:
    tokens = TokenUsage()
    bindings: List[EventBinding] = []
    state_hints: List[StateHint] = []

    tree = _build_tree(
        root,
        path="body" if root.name == "body" else root.name or "root",
        tokens=tokens,
        bindings=bindings,
        state_hints=state_hints,
    )

    tokens.colors = sorted(set(tokens.colors))
    tokens.tailwind_classes = sorted(set(tokens.tailwind_classes))
    tokens.custom_properties = sorted(set(tokens.custom_properties))
    tokens.hardcoded_pixels = sorted(set(tokens.hardcoded_pixels))
    tokens.fonts = sorted(set(tokens.fonts))
    return tree, tokens, bindings, state_hints


def _build_tree(
    node: Tag,
    *,
    path: str,
    tokens: TokenUsage,
    bindings: List[EventBinding],
    state_hints: List[StateHint],
) -> ComponentNode:
    raw_classes = cast(Any, node.get("class", []) or [])
    classes: List[str] = [str(c) for c in raw_classes]
    role_attr = cast(Any, node.get("role"))
    role = str(role_attr) if isinstance(role_attr, str) else None
    text_parts: List[str] = []
    for child in cast(Iterator[PageElement], node.children):
        if isinstance(child, str):
            stripped = child.strip()
            if stripped:
                text_parts.append(stripped)

    attributes: Dict[str, str] = {}
    attrs = cast(Dict[str, Any], node.attrs)
    for attr, value in attrs.items():
        if attr == "class":
            continue
        if isinstance(value, list):
            attributes[attr] = " ".join(str(v) for v in cast(List[Any], value))
        elif value is None:
            attributes[attr] = ""
        else:
            attributes[attr] = str(value)

    _record_tokens(node, classes, attributes, tokens)
    _record_bindings(node, attributes, bindings, path)
    _record_state_hints(node, attributes, state_hints, path)

    children: List[ComponentNode] = []
    tag_children: List[Tag] = [
        c for c in cast(Iterator[PageElement], node.children) if isinstance(c, Tag)
    ]
    for index, child in enumerate(tag_children):
        child_name = str(child.name or "")
        child_path = f"{path}>{child_name}[{index}]" if child_name else path
        children.append(
            _build_tree(
                child,
                path=child_path,
                tokens=tokens,
                bindings=bindings,
                state_hints=state_hints,
            )
        )

    return ComponentNode(
        tag=node.name or "unknown",
        role=role,
        classes=classes,
        text=" ".join(text_parts) or None,
        attributes=attributes,
        children=children,
        path=path,
    )


def _record_tokens(
    node: Tag,
    classes: List[str],
    attributes: Dict[str, str],
    tokens: TokenUsage,
) -> None:
    for cls in classes:
        if cls:
            tokens.tailwind_classes.append(cls)

    style_raw = attributes.get("style")
    style = style_raw or ""
    for match in _HEX_COLOR_RE.findall(style):
        tokens.colors.append(match)
    for match in _RGB_COLOR_RE.findall(style):
        tokens.colors.append(match)
    for match in _CUSTOM_PROP_RE.findall(style):
        tokens.custom_properties.append(f"--{match}")
    for match in _PX_RE.findall(style):
        tokens.hardcoded_pixels.append(match)
    for match in _FONT_RE.findall(style):
        tokens.fonts.append(match.strip())

    if node.name == "style" and node.string:
        style_body = str(node.string)
        for match in _HEX_COLOR_RE.findall(style_body):
            tokens.colors.append(match)
        for match in _RGB_COLOR_RE.findall(style_body):
            tokens.colors.append(match)
        for match in _CUSTOM_PROP_RE.findall(style_body):
            tokens.custom_properties.append(f"--{match}")
        for match in _FONT_RE.findall(style_body):
            tokens.fonts.append(match.strip())


def _record_bindings(
    node: Tag,
    attributes: Dict[str, str],
    bindings: List[EventBinding],
    path: str,
) -> None:
    tag_name = str(node.name or "unknown")
    for attr in _ATTR_EVENTS:
        if attr in attributes:
            bindings.append(
                EventBinding(
                    element=tag_name,
                    event=attr[2:],
                    handler=attributes[attr],
                    element_path=path,
                )
            )
    if tag_name == "form":
        bindings.append(
            EventBinding(
                element="form",
                event="submit",
                handler=attributes.get("onsubmit") or "submit-handler",
                element_path=path,
            )
        )


def _record_state_hints(
    node: Tag,
    attributes: Dict[str, str],
    state_hints: List[StateHint],
    path: str,
) -> None:
    tag_name = str(node.name or "unknown")
    if tag_name in {"input", "textarea", "select"}:
        state_hints.append(
            StateHint(
                kind="form_input",
                summary=(
                    f"<{tag_name}> '{attributes.get('name') or attributes.get('id') or 'field'}'"
                    " should bind to a typed form model."
                ),
                element_path=path,
            )
        )
    if tag_name in {"ul", "ol"}:
        tag_children: List[Tag] = [
            c for c in cast(Iterator[PageElement], node.children) if isinstance(c, Tag)
        ]
        if len(tag_children) >= 2:
            state_hints.append(
                StateHint(
                    kind="list",
                    summary=(
                        f"<{tag_name}> with {len(tag_children)} children should"
                        " render from an iterable, not be hand-written."
                    ),
                    element_path=path,
                )
            )
    if tag_name == "table":
        state_hints.append(
            StateHint(
                kind="list",
                summary=(
                    "<table> rows should render from a typed rows collection; header"
                    " and body should be driven by the data model."
                ),
                element_path=path,
            )
        )
    if "aria-pressed" in attributes or "aria-expanded" in attributes:
        state_hints.append(
            StateHint(
                kind="toggle",
                summary=(
                    f"<{tag_name}> exposes an aria toggle state; back it with a"
                    " reactive boolean."
                ),
                element_path=path,
            )
        )
    if "data-loading" in attributes or attributes.get("role") == "status":
        state_hints.append(
            StateHint(
                kind="async_data",
                summary=(
                    f"<{tag_name}> signals async data; hook into the project's data"
                    " access layer (not ad-hoc fetch)."
                ),
                element_path=path,
            )
        )


# --------------------------------------------------------------------------- reuse

def _suggest_reuses(
    tree: ComponentNode,
    project_context: ProjectContext,
) -> Tuple[List[ReuseSuggestion], List[str]]:
    suggestions: List[ReuseSuggestion] = []
    seen_components: set[str] = set()
    matched_paths: set[str] = set()

    for component in project_context.components:
        selector = component.selector or ""
        keywords = _keywords_for_component(component)
        for path, node in _iter_tree(tree):
            if path in matched_paths:
                continue
            if not _matches_component(node, selector, keywords):
                continue
            suggestions.append(
                ReuseSuggestion(
                    component_name=component.name,
                    component_selector=component.selector,
                    component_file=component.file_path,
                    rationale=_reuse_rationale(component, node),
                    matched_element_path=path,
                    confidence=_reuse_confidence(component, node, selector),
                )
            )
            seen_components.add(component.name)
            matched_paths.add(path)
            break

    existing_names = {c.name.lower() for c in project_context.components}
    new_components: List[str] = []
    for path, node in _iter_tree(tree):
        semantic = _semantic_hint(node)
        if semantic and semantic.lower() not in existing_names:
            new_components.append(semantic)
    new_components = sorted(set(new_components) - seen_components)

    return suggestions, new_components


def _iter_tree(node: ComponentNode) -> Iterator[Tuple[str, ComponentNode]]:
    yield node.path, node
    for child in node.children:
        yield from _iter_tree(child)


def _keywords_for_component(component: ComponentInfo) -> List[str]:
    name = component.name
    tokens: List[str] = []
    tokens.append(name.lower())
    spaced = re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower()
    tokens.extend(spaced.split("-"))
    if component.selector:
        tokens.extend(component.selector.lower().split("-"))
    return [t for t in tokens if t and t not in {"component", "app"}]


def _matches_component(
    node: ComponentNode,
    selector: str,
    keywords: List[str],
) -> bool:
    haystack_bits = [
        node.tag.lower(),
        " ".join(node.classes).lower(),
        (node.role or "").lower(),
        (node.attributes.get("data-component") or "").lower(),
        (node.attributes.get("data-role") or "").lower(),
    ]
    haystack = " ".join(haystack_bits)

    if selector:
        if selector in haystack:
            return True
        if selector.replace("app-", "") in haystack:
            return True
    for keyword in keywords:
        if len(keyword) < 3:
            continue
        if keyword in haystack:
            return True
    return False


def _reuse_rationale(component: ComponentInfo, node: ComponentNode) -> str:
    selector = component.selector or component.name
    return (
        f"Use <{selector}> from {component.file_path} instead of re-implementing"
        f" <{node.tag}> with these classes. Reusing the existing component keeps"
        " spacing, tokens, and behavior aligned with the rest of the project."
    )


def _reuse_confidence(
    component: ComponentInfo,
    node: ComponentNode,
    selector: str,
) -> str:
    if selector and selector in " ".join(node.classes).lower():
        return "high"
    if selector and selector.replace("app-", "") in node.tag.lower():
        return "high"
    if node.role and component.selector and component.selector.endswith(node.role):
        return "medium"
    return "low"


def _semantic_hint(node: ComponentNode) -> Optional[str]:
    classes = " ".join(node.classes).lower()
    if "card" in classes:
        return "card"
    if "modal" in classes or node.role == "dialog":
        return "modal"
    if "badge" in classes or "chip" in classes:
        return "badge"
    if "banner" in classes:
        return "banner"
    if "toolbar" in classes:
        return "toolbar"
    if node.tag == "nav":
        return "nav"
    return None


# --------------------------------------------------------------------------- alignment / markdown

def _context_fingerprint(ctx: Optional[ProjectContext]) -> Optional[str]:
    if ctx is None:
        return None
    payload: Dict[str, Any] = {
        "framework": ctx.framework.model_dump(),
        "component_count": len(ctx.components),
        "tailwind": ctx.css_tokens.tailwind_config_path,
        "css_props": sorted(list(ctx.css_tokens.css_custom_properties.keys())[:8]),
        "patterns": ctx.patterns.model_dump(exclude={"evidence"}),
    }
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:12]


def _alignment_notes(
    project_context: ProjectContext,
    tokens: TokenUsage,
    bindings: List[EventBinding],
    state_hints: List[StateHint],
) -> List[str]:
    notes: List[str] = []
    framework = project_context.framework.name
    patterns = project_context.patterns

    if framework == "angular":
        if patterns.uses_signals:
            notes.append(
                "State idiom: this project uses Angular signals. Model list and"
                " toggle state as `signal<T>()` / `computed()`, not RxJS streams."
            )
        elif patterns.uses_observables:
            notes.append(
                "State idiom: this project uses RxJS observables. Model async data"
                " with `Observable`/`AsyncPipe`, not ad-hoc `setTimeout` or local"
                " state."
            )
        if patterns.angular_standalone:
            notes.append(
                "Component style: this project uses standalone components; new"
                " components must set `standalone: true` and import their"
                " dependencies directly."
            )
        elif patterns.angular_standalone is False:
            notes.append(
                "Component style: this project uses NgModule-registered components;"
                " declare the new component in the appropriate module."
            )
        if patterns.angular_zoneless:
            notes.append(
                "Change detection: project runs zoneless. Avoid APIs that assume"
                " zone-based change detection."
            )
    elif framework in {"react", "next"}:
        if patterns.uses_hooks:
            notes.append(
                "State idiom: this project uses React hooks. Manage local state"
                " with `useState`/`useReducer` and side effects with `useEffect`."
            )
    elif framework == "vue":
        if patterns.uses_composition_api:
            notes.append(
                "State idiom: this project uses the Vue composition API. Model"
                " reactive state with `ref()`/`reactive()`, not the options API."
            )

    if project_context.css_tokens.css_custom_properties:
        first_props = list(project_context.css_tokens.css_custom_properties.keys())[:6]
        if tokens.colors:
            notes.append(
                "CSS tokens: project defines custom properties "
                f"{first_props}. Prefer `var(--name)` over hardcoded hex colors"
                " like " + ", ".join(tokens.colors[:3]) + "."
            )
        else:
            notes.append(
                "CSS tokens: project defines custom properties "
                f"{first_props}. Prefer `var(--name)` references when adding"
                " colors, spacing, or typography."
            )
    if project_context.css_tokens.tailwind_config_path:
        notes.append(
            "Tailwind: project ships a tailwind config at "
            f"{project_context.css_tokens.tailwind_config_path}. Reuse the"
            " configured theme tokens rather than inventing one-off values."
        )

    if bindings:
        notes.append(
            "Event bindings: the spec uses inline `on*=` attributes; bind through"
            " the framework's idiomatic event syntax (`(click)`, `onClick`, `@click`)"
            " instead of inline JavaScript strings."
        )
    if any(hint.kind == "list" for hint in state_hints):
        if framework == "angular":
            notes.append(
                "Lists: render from an iterable via `@for` (Angular 17+) or"
                " `*ngFor`; do not hand-code repeated markup."
            )
        elif framework in {"react", "next"}:
            notes.append(
                "Lists: render from an iterable via `.map(...)`; do not hand-code"
                " repeated markup."
            )
        elif framework == "vue":
            notes.append(
                "Lists: render with `v-for`; do not hand-code repeated markup."
            )
    if any(hint.kind == "form_input" for hint in state_hints):
        if framework == "angular":
            notes.append(
                "Forms: bind inputs through Angular forms (`FormControl` or"
                " `[(ngModel)]`) rather than raw DOM values."
            )
        elif framework in {"react", "next"}:
            notes.append(
                "Forms: bind inputs to controlled component state or a form"
                " library already in the project."
            )

    notes.append(
        "Align better than the spec did: the spec was generated from a"
        " screenshot approximation — treat copy, iconography, and spacing as"
        " hints, not source of truth, and prefer the project's tokens and"
        " existing components over the literal output."
    )
    return notes


def _generic_alignment_notes(
    tokens: TokenUsage,
    bindings: List[EventBinding],
    state_hints: List[StateHint],
) -> List[str]:
    notes: List[str] = [
        "No project context was gathered. The following are generic placeholders —"
        " call `gather_project_context` against the target repo and rerun"
        " `extract_design_spec` for framework-aware guidance.",
    ]
    if tokens.colors:
        notes.append(
            "CSS tokens: hardcoded colors "
            f"{tokens.colors[:3]} detected; map these to the target project's"
            " design tokens once context is gathered."
        )
    if bindings:
        notes.append(
            "Event bindings: inline `on*=` attributes must be translated to the"
            " target framework's idiomatic event syntax."
        )
    if any(hint.kind == "list" for hint in state_hints):
        notes.append(
            "Lists: render repeating markup from an iterable once the framework"
            " is known."
        )
    return notes


def _summary_line(
    tree: ComponentNode,
    tokens: TokenUsage,
    project_context: Optional[ProjectContext],
) -> str:
    root_tag = tree.tag
    child_count = len(tree.children)
    class_sample = ", ".join(tree.classes[:4]) if tree.classes else "no top-level classes"
    color_sample = (
        ", ".join(tokens.colors[:3])
        if tokens.colors
        else "no inline color literals"
    )
    fw = (
        project_context.framework.name if project_context is not None else "unknown"
    )
    return (
        f"{root_tag}-rooted tree with {child_count} top-level children"
        f" ({class_sample}); colors={color_sample}; target framework={fw}."
    )


def _render_markdown(
    spec: DesignSpec,
    *,
    project_context: Optional[ProjectContext],
) -> str:
    lines: List[str] = []
    header_ctx = (
        f"project {project_context.framework.name}"
        if project_context is not None
        else "no project context"
    )
    lines.append(
        f"# Implementer Handoff — variant {spec.variant_index} ({header_ctx})"
    )
    lines.append("")
    lines.append(
        "This document is a handoff prompt, not documentation. Read it before"
        " opening the editor and use it as the contract for integrating the"
        " variant into the target project."
    )
    lines.append("")
    lines.append(f"- Session: `{spec.session_id}`")
    if spec.model:
        lines.append(f"- Source model: `{spec.model}`")
    lines.append(f"- Summary: {spec.summary}")
    if spec.project_context_fingerprint:
        lines.append(
            f"- Project context fingerprint: `{spec.project_context_fingerprint}`"
        )
    lines.append("")

    lines.append("## Align with project patterns")
    lines.append("")
    if not spec.alignment_notes:
        lines.append("- (no alignment notes available)")
    for note in spec.alignment_notes:
        lines.append(f"- {note}")
    lines.append("")

    lines.append("## Component tree (abridged)")
    lines.append("")
    lines.append("```")
    lines.extend(_render_tree_lines(spec.component_tree))
    lines.append("```")
    lines.append("")

    lines.append("## Reuse existing components")
    lines.append("")
    if spec.reuse_suggestions:
        for suggestion in spec.reuse_suggestions:
            selector = suggestion.component_selector or suggestion.component_name
            location = suggestion.component_file or "(unknown path)"
            lines.append(
                f"- Use `<{selector}>` at element `{suggestion.matched_element_path}`;"
                f" defined at `{location}`. {suggestion.rationale}"
                f" (confidence: {suggestion.confidence})"
            )
    elif project_context is not None:
        lines.append(
            "- No reuse candidates detected. Confirm by searching the project's"
            " component inventory before introducing new components."
        )
    else:
        lines.append(
            "- Reuse suggestions unavailable without project context."
            " Call `gather_project_context` first."
        )
    lines.append("")

    lines.append("## New components likely needed")
    lines.append("")
    if spec.new_components_needed:
        for semantic in spec.new_components_needed:
            lines.append(
                f"- `{semantic}` — no matching component in the inventory; propose"
                " a new one and align its API with existing components."
            )
    else:
        lines.append("- None detected.")
    lines.append("")

    lines.append("## Tokens used in the variant")
    lines.append("")
    if spec.tokens_used.tailwind_classes:
        preview = ", ".join(spec.tokens_used.tailwind_classes[:12])
        lines.append(f"- Tailwind classes: {preview}")
    if spec.tokens_used.colors:
        lines.append(
            "- Colors (literal): " + ", ".join(spec.tokens_used.colors[:6])
        )
    if spec.tokens_used.custom_properties:
        lines.append(
            "- CSS custom properties referenced: "
            + ", ".join(spec.tokens_used.custom_properties[:6])
        )
    if spec.tokens_used.hardcoded_pixels:
        lines.append(
            "- Hardcoded pixel values (review against the spacing scale): "
            + ", ".join(spec.tokens_used.hardcoded_pixels[:6])
        )
    if spec.tokens_used.fonts:
        lines.append(
            "- Fonts: " + ", ".join(spec.tokens_used.fonts[:3])
        )
    if not any(
        [
            spec.tokens_used.tailwind_classes,
            spec.tokens_used.colors,
            spec.tokens_used.custom_properties,
            spec.tokens_used.hardcoded_pixels,
            spec.tokens_used.fonts,
        ]
    ):
        lines.append("- No tokens captured.")
    lines.append("")

    lines.append("## Event bindings")
    lines.append("")
    if spec.event_bindings:
        for binding in spec.event_bindings:
            lines.append(
                f"- `{binding.element}` → `{binding.event}` (handler: "
                f"`{binding.handler or 'unnamed'}`, at `{binding.element_path}`)."
                " Translate to the framework's idiomatic event syntax."
            )
    else:
        lines.append("- None detected.")
    lines.append("")

    lines.append("## State hints")
    lines.append("")
    if spec.state_hints:
        for hint in spec.state_hints:
            lines.append(f"- ({hint.kind}) {hint.summary}")
    else:
        lines.append("- None detected.")
    lines.append("")

    lines.append("## Implementer checklist")
    lines.append("")
    lines.append(
        "- [ ] Resolve every 'Reuse existing components' entry before writing"
        " net-new markup."
    )
    lines.append(
        "- [ ] Replace literal colors with project tokens where a token exists."
    )
    lines.append(
        "- [ ] Render repeating elements from data, never from hand-written"
        " duplicates."
    )
    lines.append(
        "- [ ] Bind every event through framework-idiomatic syntax — no inline"
        " `on*=` strings."
    )
    lines.append(
        "- [ ] Leave a short comment only where behavior is non-obvious;"
        " otherwise let the code speak."
    )
    lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _render_tree_lines(
    node: ComponentNode,
    depth: int = 0,
    max_depth: int = 3,
    max_children: int = 4,
) -> List[str]:
    indent = "  " * depth
    tag_bits = [node.tag]
    if node.classes:
        tag_bits.append("." + ".".join(node.classes[:3]))
    if node.role:
        tag_bits.append(f"[role={node.role}]")
    line = f"{indent}<{' '.join(tag_bits)}>"
    if node.text:
        trimmed = node.text[:60] + ("..." if len(node.text) > 60 else "")
        line += f" — {trimmed}"
    result = [line]
    if depth >= max_depth:
        if node.children:
            result.append(f"{indent}  (+{len(node.children)} descendants truncated)")
        return result
    for child in node.children[:max_children]:
        result.extend(_render_tree_lines(child, depth=depth + 1, max_depth=max_depth))
    if len(node.children) > max_children:
        result.append(
            f"{indent}  (+{len(node.children) - max_children} more siblings truncated)"
        )
    return result
