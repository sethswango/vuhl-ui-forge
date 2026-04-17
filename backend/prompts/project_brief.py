"""Build a concise, LLM-friendly project alignment brief.

Round 6C wires the brief into ``PromptCreationStage`` so the first-turn
generators stop inventing design tokens and instead reuse the components,
colors, and conventions that already live in the target repo. The brief is
intentionally short — it is prepended to an already large system prompt, so
every byte has to earn its place. Anything bulky (raw token dumps, full
component metadata) belongs downstream in the design spec, not here.

Contract:

- Pure: no I/O, no logging, deterministic output for deterministic input.
- Safe on empty / unknown contexts: returns ``None`` so callers can drop the
  brief entirely without emitting a confusing "framework: unknown" header.
- Bounded: hard caps on component count, CSS token count, and total length so
  a pathological scanner output never pushes the system message past the
  model's context budget.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from context.models import ComponentInfo, ConventionsSummary, CssTokens, ProjectContext


_MAX_COMPONENTS = 8
_MAX_COLORS = 8
_MAX_CUSTOM_CLASSES = 8
_MAX_CSS_VARS = 6
_MAX_FOLDER_NOTES = 5
_MAX_BRIEF_CHARS = 2400


def build_project_brief(context: "ProjectContext | None") -> str | None:
    """Render a concise alignment brief from a scanned project context.

    Returns ``None`` when the context is missing, when the framework is
    genuinely unknown, and when the scanner produced no meaningful signals
    (no components, no CSS tokens, no pattern flags, no conventions). An empty
    brief would cost tokens without adding guidance, so we drop it.

    The string is shaped for direct concatenation into the system prompt, so
    it starts with a markdown heading and ends with an alignment-rule block
    that tells the generator how to use the information above it.
    """
    if context is None:
        return None

    if not _has_meaningful_signal(context):
        return None

    framework_line = _render_framework(context)
    components_block = _render_components(context.components)
    tokens_block = _render_css_tokens(context.css_tokens)
    patterns_block = _render_patterns(context)
    conventions_block = _render_conventions(context.conventions)

    sections: list[str] = ["# Project alignment brief"]
    if framework_line:
        sections.append(framework_line)
    if patterns_block:
        sections.append(patterns_block)
    if components_block:
        sections.append(components_block)
    if tokens_block:
        sections.append(tokens_block)
    if conventions_block:
        sections.append(conventions_block)
    sections.append(_ALIGNMENT_RULES)

    if len(sections) <= 2:
        # Only the heading + alignment rules survived filtering. That means
        # nothing concrete was worth telling the model about; skip the brief.
        return None

    rendered = "\n\n".join(sections).strip()
    if len(rendered) > _MAX_BRIEF_CHARS:
        # Hard cap protects the system prompt budget even for adversarial
        # project shapes. Truncate with an ellipsis so the LLM understands
        # the cut was mechanical, not a signal that the list ended.
        rendered = rendered[: _MAX_BRIEF_CHARS - 3].rstrip() + "…"
    return rendered


def _has_meaningful_signal(context: "ProjectContext") -> bool:
    """Return True if the scanner found at least one usable signal.

    We treat "framework != unknown" OR any component/token/pattern/convention
    presence as meaningful. The all-empty case happens when a path is scanned
    that isn't actually a project root (wrong directory, aborted scan).
    """
    framework_name = (context.framework.name or "").lower()
    if framework_name and framework_name != "unknown":
        return True
    if context.components:
        return True
    tokens = context.css_tokens
    if (
        tokens.tailwind_colors
        or tokens.tailwind_custom_classes
        or tokens.css_custom_properties
        or tokens.scss_variables
    ):
        return True
    patterns = context.patterns
    if patterns.state_style and patterns.state_style != "unknown":
        return True
    if patterns.rendering_style:
        return True
    conventions = context.conventions
    if conventions.naming_style or conventions.folder_layout:
        return True
    return False


def _render_framework(context: "ProjectContext") -> str:
    """Render a single-line framework summary.

    Empty when the framework is unknown *and* no useful sub-fields exist.
    """
    parts: list[str] = []
    name = (context.framework.name or "").strip()
    if name and name.lower() != "unknown":
        if context.framework.version:
            parts.append(f"{name} {context.framework.version}")
        else:
            parts.append(name)
    if context.framework.language:
        parts.append(context.framework.language)
    if context.framework.build_tool:
        parts.append(f"{context.framework.build_tool} build")

    if not parts:
        return ""
    return "**Framework:** " + ", ".join(parts) + "."


def _render_patterns(context: "ProjectContext") -> str:
    """Summarize the state + rendering style in one line.

    Emits nothing if both fields are missing, which is the "pure HTML" case.
    """
    patterns = context.patterns
    flavor_bits: list[str] = []
    if patterns.state_style and patterns.state_style != "unknown":
        flavor_bits.append(f"{patterns.state_style} state")
    if patterns.rendering_style:
        flavor_bits.append(f"{patterns.rendering_style} rendering")
    if patterns.angular_standalone:
        flavor_bits.append("standalone components")
    if patterns.angular_zoneless:
        flavor_bits.append("zoneless")
    if patterns.uses_rxjs and "observables" not in (patterns.state_style or ""):
        flavor_bits.append("RxJS in use")
    if not flavor_bits:
        return ""
    return "**Patterns:** " + "; ".join(flavor_bits) + "."


def _render_components(components: "list[ComponentInfo]") -> str:
    """List a handful of existing components with their selectors.

    Prioritizes components that have a selector (strongest reuse signal) and
    then stable component kinds so the LLM sees the most obviously reusable
    pieces first. Truncation is silent because the full list is not semantic
    guidance to the model; a visible count of trailing pieces would only
    encourage the model to hallucinate the rest.
    """
    if not components:
        return ""

    def _sort_key(component: "ComponentInfo") -> tuple[int, int, str]:
        has_selector = 0 if component.selector else 1
        is_known_kind = 0 if component.kind != "unknown" else 1
        return (has_selector, is_known_kind, component.name.lower())

    ordered = sorted(components, key=_sort_key)[:_MAX_COMPONENTS]
    lines = ["**Reusable components (reference these by selector/name when the screenshot matches):**"]
    for component in ordered:
        selector = f"`<{component.selector}>`" if component.selector else f"`{component.name}`"
        inputs = _format_component_inputs(component)
        path = component.file_path
        lines.append(f"- {selector} — {path}{inputs}")
    return "\n".join(lines)


def _format_component_inputs(component: "ComponentInfo") -> str:
    """Render a trailing "inputs: a, b, c" clause when helpful."""
    if not component.inputs:
        return ""
    names = [inp.name for inp in component.inputs if inp.name]
    if not names:
        return ""
    # Keep the list short; any longer and the brief gets crowded.
    trimmed = names[:4]
    suffix = ", …" if len(names) > 4 else ""
    return " — inputs: " + ", ".join(trimmed) + suffix


def _render_css_tokens(tokens: "CssTokens") -> str:
    """Render color, class, and variable tokens worth reusing.

    Empty tokens become an empty string rather than a header with no body so
    the brief stays tight.
    """
    blocks: list[str] = []

    color_line = _render_color_line(tokens.tailwind_colors)
    if color_line:
        blocks.append(color_line)

    if tokens.tailwind_custom_classes:
        classes = tokens.tailwind_custom_classes[:_MAX_CUSTOM_CLASSES]
        joined = ", ".join(f"`{cls}`" for cls in classes)
        blocks.append(f"- Tailwind custom classes: {joined}")

    if tokens.css_custom_properties:
        vars_list = list(tokens.css_custom_properties.items())[:_MAX_CSS_VARS]
        joined = ", ".join(f"`{name}`" for name, _ in vars_list)
        blocks.append(f"- CSS variables: {joined}")

    if tokens.scss_variables:
        vars_list = list(tokens.scss_variables.items())[:_MAX_CSS_VARS]
        joined = ", ".join(f"`${name}`" for name, _ in vars_list)
        blocks.append(f"- SCSS variables: {joined}")

    if not blocks:
        return ""
    header = "**Design tokens to reuse (do not invent parallel tokens):**"
    return "\n".join([header, *blocks])


def _render_color_line(colors: "dict[str, object]") -> str:
    """Collapse Tailwind color tokens into a single line.

    Tailwind config colors can be scalars (``"primary": "#1D4ED8"``) or nested
    maps (``"primary": {"500": "#1D4ED8", ...}``). We only surface the top
    level so the line stays readable; the LLM can ask for shades if needed.
    """
    if not colors:
        return ""
    names = list(colors.keys())[:_MAX_COLORS]
    if not names:
        return ""
    joined = ", ".join(f"`{name}`" for name in names)
    return f"- Tailwind colors: {joined}"


def _render_conventions(conventions: "ConventionsSummary") -> str:
    """Render project-level conventions worth respecting."""
    parts: list[str] = []
    if conventions.naming_style:
        parts.append(f"naming: {conventions.naming_style}")
    if conventions.template_style:
        parts.append(f"templates: {conventions.template_style}")
    if conventions.import_style:
        parts.append(f"imports: {conventions.import_style}")
    if conventions.folder_layout:
        folders = conventions.folder_layout[:_MAX_FOLDER_NOTES]
        parts.append("folders: " + ", ".join(f"`{folder}`" for folder in folders))
    if not parts:
        return ""
    return "**Conventions:** " + "; ".join(parts) + "."


_ALIGNMENT_RULES = """## Alignment rules
- Prefer the tokens, selectors, and conventions listed above over inventing parallel ones.
- When an element in the user's screenshot maps cleanly to an existing component (button, modal, card, input, badge, toolbar), reuse the component's name in your markup so the downstream implementer can wire it up.
- When a color or spacing value matches a listed token, use the token's name (not the raw hex/px).
- Do not contradict the project's framework or state style in your comments. The generated artifact is a design mockup; the implementer will bind it to the real framework.
- If nothing above matches what the screenshot needs, fall through to the user's instructions — do not force a fit."""
