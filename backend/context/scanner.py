"""Filesystem scanner that produces a :class:`ProjectContext`.

The scanner is deliberately lightweight: it reads a handful of manifest files
and performs regex-based sweeps over `.ts`, `.tsx`, `.jsx`, `.vue`, `.svelte`,
`.scss`, `.css`, and `.html` files. It is not a full AST parser. The goal is
to produce enough structured signal for the MCP spec extractor to hand off a
framework-idiomatic prompt to an implementer agent.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .models import (
    ComponentInfo,
    ComponentInput,
    ConventionsSummary,
    CssTokens,
    FrameworkInfo,
    PatternSignals,
    ProjectContext,
)


DEFAULT_MAX_FILES = 400
DEFAULT_MAX_COMPONENTS = 80
IGNORE_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".cache",
    ".turbo",
    "coverage",
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".parcel-cache",
    "out",
    "target",
}
CODE_SUFFIXES = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".vue",
    ".svelte",
    ".html",
    ".htm",
}
STYLE_SUFFIXES = {".css", ".scss", ".sass", ".less"}


def scan_project_context(
    repo_path: str | Path,
    *,
    max_files: int = DEFAULT_MAX_FILES,
    max_components: int = DEFAULT_MAX_COMPONENTS,
) -> ProjectContext:
    root = Path(repo_path).resolve()
    if not root.exists():
        raise FileNotFoundError(f"Target repo path does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Target repo path is not a directory: {root}")

    framework = _detect_framework(root)
    tokens = _extract_css_tokens(root)
    components, patterns, conventions, files_scanned, truncated, warnings = (
        _scan_source_tree(
            root,
            framework=framework,
            max_files=max_files,
            max_components=max_components,
        )
    )
    conventions.folder_layout = _summarize_folder_layout(root)

    return ProjectContext(
        repo_path=str(root),
        framework=framework,
        components=components,
        css_tokens=tokens,
        patterns=patterns,
        conventions=conventions,
        files_scanned=files_scanned,
        truncated=truncated,
        warnings=warnings,
    )


# --------------------------------------------------------------------------- framework

_ANGULAR_DEPS = {"@angular/core", "@angular/common"}
_REACT_DEPS = {"react", "next", "@remix-run/react", "preact"}
_VUE_DEPS = {"vue", "nuxt"}
_SVELTE_DEPS = {"svelte", "@sveltejs/kit"}


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def _read_text(path: Path, limit: int = 200_000) -> Optional[str]:
    try:
        data = path.read_bytes()[:limit]
        return data.decode("utf-8", errors="replace")
    except OSError:
        return None


def _detect_framework(root: Path) -> FrameworkInfo:
    evidence: List[str] = []
    package_json_path = root / "package.json"
    package_json = _read_json(package_json_path) if package_json_path.exists() else None

    angular_json_path = root / "angular.json"
    pyproject_path = root / "pyproject.toml"
    tsconfig_path = root / "tsconfig.json"

    deps: Dict[str, str] = {}
    if package_json is not None:
        evidence.append("package.json")
        deps.update(package_json.get("dependencies", {}) or {})
        deps.update(package_json.get("devDependencies", {}) or {})

    name = "unknown"
    version: Optional[str] = None
    language: Optional[str] = None
    package_manager: Optional[str] = None
    build_tool: Optional[str] = None

    if angular_json_path.exists() or any(dep in deps for dep in _ANGULAR_DEPS):
        name = "angular"
        if angular_json_path.exists():
            evidence.append("angular.json")
        version = deps.get("@angular/core")
    elif any(dep in deps for dep in _REACT_DEPS):
        name = "react"
        if "next" in deps:
            name = "next"
            version = deps.get("next")
        else:
            version = deps.get("react")
    elif any(dep in deps for dep in _VUE_DEPS):
        name = "vue"
        version = deps.get("vue") or deps.get("nuxt")
    elif any(dep in deps for dep in _SVELTE_DEPS):
        name = "svelte"
        version = deps.get("svelte")
    elif pyproject_path.exists():
        name = "python"
        evidence.append("pyproject.toml")
    else:
        for candidate in root.iterdir():
            if candidate.suffix.lower() in {".html", ".htm"} and candidate.is_file():
                name = "plain_html"
                evidence.append(candidate.name)
                break

    if tsconfig_path.exists():
        language = "typescript"
        evidence.append("tsconfig.json")
    elif package_json is not None:
        language = "javascript"
    elif name == "python":
        language = "python"
    elif name == "plain_html":
        language = "html"

    if package_json is not None:
        if "vite" in deps:
            build_tool = "vite"
        elif "webpack" in deps:
            build_tool = "webpack"
        elif name == "angular":
            build_tool = "angular-cli"
        elif name == "next":
            build_tool = "next"

        if (root / "pnpm-lock.yaml").exists():
            package_manager = "pnpm"
        elif (root / "yarn.lock").exists():
            package_manager = "yarn"
        elif (root / "package-lock.json").exists():
            package_manager = "npm"
        elif (root / "bun.lockb").exists():
            package_manager = "bun"

    if version is not None:
        version = version.lstrip("^~>=< ")

    return FrameworkInfo(
        name=name,
        version=version,
        language=language,
        package_manager=package_manager,
        build_tool=build_tool,
        evidence=evidence,
    )


# --------------------------------------------------------------------------- css tokens

_CSS_VAR_RE = re.compile(r"--([a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)[;}]")
_SCSS_VAR_RE = re.compile(r"\$([a-zA-Z0-9_-]+)\s*:\s*([^;}{]+);")
_TAILWIND_FILES = (
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.cjs",
    "tailwind.config.mjs",
)


def _find_tailwind_config(root: Path) -> Optional[Path]:
    for name in _TAILWIND_FILES:
        candidate = root / name
        if candidate.exists():
            return candidate
    return None


def _parse_tailwind_theme(text: str) -> Tuple[List[str], Dict[str, Any], Dict[str, Any], List[str]]:
    """Very small, best-effort parse of a Tailwind config.

    We extract:
    - theme keys (under extend or root theme)
    - color values (string literals inside theme.colors / theme.extend.colors)
    - spacing values
    - custom class suggestions referenced via addComponents (rare)
    """
    keys: List[str] = []
    colors: Dict[str, Any] = {}
    spacing: Dict[str, Any] = {}
    custom_classes: List[str] = []

    theme_match = re.search(r"theme\s*:\s*\{", text)
    if theme_match:
        body = _slice_balanced(text, theme_match.end() - 1)
        if body is not None:
            keys = _extract_top_level_keys(body)
            colors = _extract_nested_map(body, "colors")
            spacing = _extract_nested_map(body, "spacing")

    for match in re.finditer(r"addComponents\s*\(\s*\{([^}]*)\}", text):
        class_body = match.group(1)
        custom_classes.extend(re.findall(r"'(\.[^']+)'|\"(\.[^\"]+)\"", class_body))

    custom_classes = [item for tup in custom_classes for item in tup if item]

    return keys, colors, spacing, custom_classes


def _slice_balanced(text: str, brace_start: int) -> Optional[str]:
    depth = 0
    for index in range(brace_start, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[brace_start : index + 1]
    return None


def _extract_top_level_keys(body: str) -> List[str]:
    keys: List[str] = []
    stripped = body[1:-1] if body.startswith("{") and body.endswith("}") else body
    depth = 0
    buffer = ""
    for char in stripped:
        if char == "{" or char == "[":
            depth += 1
            buffer += char
        elif char == "}" or char == "]":
            depth -= 1
            buffer += char
        elif char == "," and depth == 0:
            keys.append(buffer)
            buffer = ""
        else:
            buffer += char
    if buffer.strip():
        keys.append(buffer)

    names: List[str] = []
    for chunk in keys:
        key_match = re.match(r"\s*(?:extend\s*:\s*\{)?\s*['\"]?([a-zA-Z0-9_-]+)['\"]?\s*:", chunk)
        if key_match:
            names.append(key_match.group(1))
    return sorted(set(names))


def _extract_nested_map(body: str, key_name: str) -> Dict[str, Any]:
    pattern = re.compile(rf"{re.escape(key_name)}\s*:\s*\{{")
    match = pattern.search(body)
    if not match:
        return {}
    block = _slice_balanced(body, match.end() - 1)
    if block is None:
        return {}
    result: Dict[str, Any] = {}
    for entry in re.finditer(
        r"['\"]?([a-zA-Z0-9_-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", block
    ):
        result[entry.group(1)] = entry.group(2)
    return result


def _extract_css_tokens(root: Path) -> CssTokens:
    tokens = CssTokens()
    tailwind_config_path = _find_tailwind_config(root)
    if tailwind_config_path is not None:
        tokens.tailwind_config_path = str(tailwind_config_path.relative_to(root))
        text = _read_text(tailwind_config_path) or ""
        keys, colors, spacing, custom_classes = _parse_tailwind_theme(text)
        tokens.tailwind_theme_keys = keys
        tokens.tailwind_colors = colors
        tokens.tailwind_spacing = spacing
        tokens.tailwind_custom_classes = custom_classes
        tokens.token_sources.append(str(tailwind_config_path.relative_to(root)))

    for path in _iter_files(root, STYLE_SUFFIXES, limit=80):
        rel = str(path.relative_to(root))
        text = _read_text(path)
        if text is None:
            continue
        for match in _CSS_VAR_RE.finditer(text):
            name = match.group(1).strip()
            value = match.group(2).strip()
            tokens.css_custom_properties.setdefault(f"--{name}", value)
        if path.suffix.lower() in {".scss", ".sass"}:
            for match in _SCSS_VAR_RE.finditer(text):
                name = match.group(1).strip()
                value = match.group(2).strip()
                tokens.scss_variables.setdefault(f"${name}", value)
        if rel not in tokens.token_sources and (
            tokens.css_custom_properties or tokens.scss_variables
        ):
            tokens.token_sources.append(rel)
    return tokens


# --------------------------------------------------------------------------- source sweep

_ANGULAR_COMPONENT_DECORATOR = re.compile(
    r"@Component\s*\(\s*\{([^@]*?)\}\s*\)", re.DOTALL
)
_ANGULAR_SELECTOR = re.compile(r"selector\s*:\s*['\"]([^'\"]+)['\"]")
_ANGULAR_STANDALONE = re.compile(r"standalone\s*:\s*(true|false)")
_ANGULAR_CLASS_NAME = re.compile(r"export\s+class\s+([A-Z][A-Za-z0-9_]+)")
_ANGULAR_INPUT_DECORATOR = re.compile(
    r"@Input\s*\(\s*(?:['\"]([^'\"]+)['\"])?\s*\)\s*(?:set\s+)?([A-Za-z0-9_]+)\s*[:\(]([^;=\n]+)"
)
_ANGULAR_INPUT_SIGNAL = re.compile(
    r"(?:public|readonly)?\s*([A-Za-z0-9_]+)\s*=\s*input(?:\.required)?\s*<([^>]+)>\s*\("
)
_ANGULAR_MODEL_SIGNAL = re.compile(
    r"(?:public|readonly)?\s*([A-Za-z0-9_]+)\s*=\s*model(?:\.required)?\s*<([^>]+)>\s*\("
)
_REACT_COMPONENT_FN = re.compile(
    r"export\s+(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]+)\s*\(([^)]*)\)"
)
_REACT_COMPONENT_CONST = re.compile(
    r"export\s+const\s+([A-Z][A-Za-z0-9_]+)\s*(?::\s*React\.FC(?:<([^>]+)>)?)?\s*=\s*\(([^)]*)\)"
)
_REACT_PROPS_TYPE = re.compile(
    r"(?:interface|type)\s+([A-Z][A-Za-z0-9_]+Props)\b[^{]*\{([^}]*)\}"
)
_VUE_SCRIPT_SETUP = re.compile(r"<script\s+setup\b[^>]*>(.*?)</script>", re.DOTALL)
_VUE_DEFINE_PROPS = re.compile(r"defineProps\s*<\s*\{([^}]*)\}\s*>|defineProps\s*\(\s*\{([^}]*)\}\s*\)")
_VUE_DEFINE_COMPONENT = re.compile(r"defineComponent\s*\(\s*\{([^}]*)\}", re.DOTALL)
_VUE_NAME = re.compile(r"name\s*:\s*['\"]([A-Za-z0-9_-]+)['\"]")
_SVELTE_EXPORT_LET = re.compile(r"export\s+let\s+([a-zA-Z0-9_]+)\s*(?::\s*([^=;\n]+))?")


def _scan_source_tree(
    root: Path,
    *,
    framework: FrameworkInfo,
    max_files: int,
    max_components: int,
) -> Tuple[
    List[ComponentInfo],
    PatternSignals,
    ConventionsSummary,
    int,
    bool,
    List[str],
]:
    components: List[ComponentInfo] = []
    patterns = PatternSignals()
    conventions = ConventionsSummary()
    warnings: List[str] = []

    signal_count = 0
    observable_count = 0
    hook_count = 0
    composition_count = 0
    rxjs_count = 0
    standalone_votes_true = 0
    standalone_votes_false = 0
    zoneless_hits = 0
    files_scanned = 0
    truncated = False
    naming_votes: Dict[str, int] = {}
    template_votes: Dict[str, int] = {}
    import_alias_hits = 0

    for path in _iter_files(root, CODE_SUFFIXES, limit=max_files):
        files_scanned += 1
        text = _read_text(path)
        if text is None:
            continue
        rel_path = str(path.relative_to(root))

        if "signal(" in text or "computed(" in text:
            signal_count += 1
        if "Observable" in text or ".subscribe(" in text:
            observable_count += 1
        if "useState" in text or "useEffect" in text or "useMemo" in text:
            hook_count += 1
        if "defineComponent" in text or "<script setup" in text:
            composition_count += 1
        if "rxjs" in text:
            rxjs_count += 1
        if "provideZonelessChangeDetection" in text or "zoneless" in text.lower():
            zoneless_hits += 1
        if re.search(r"from\s+['\"]@/", text) or re.search(r"from\s+['\"]~/", text):
            import_alias_hits += 1

        stem = path.stem
        if "-" in stem and stem == stem.lower():
            naming_votes["kebab-files"] = naming_votes.get("kebab-files", 0) + 1
        elif stem and stem[0].isupper():
            naming_votes["PascalFiles"] = naming_votes.get("PascalFiles", 0) + 1

        if path.suffix.lower() in {".html", ".htm"}:
            template_votes["plain_html"] = template_votes.get("plain_html", 0) + 1
        elif path.suffix.lower() == ".vue":
            template_votes["sfc"] = template_votes.get("sfc", 0) + 1
        elif path.suffix.lower() == ".svelte":
            template_votes["sfc"] = template_votes.get("sfc", 0) + 1
        elif path.suffix.lower() in {".tsx", ".jsx"}:
            template_votes["jsx"] = template_votes.get("jsx", 0) + 1
        elif path.suffix.lower() == ".ts" and "templateUrl" in text:
            template_votes["template"] = template_votes.get("template", 0) + 1

        if len(components) < max_components:
            components.extend(
                _extract_components_from_file(path, rel_path, text, framework=framework)
            )

        for decorator_match in _ANGULAR_COMPONENT_DECORATOR.finditer(text):
            decorator_body = decorator_match.group(1)
            standalone_match = _ANGULAR_STANDALONE.search(decorator_body)
            if standalone_match:
                if standalone_match.group(1) == "true":
                    standalone_votes_true += 1
                else:
                    standalone_votes_false += 1

    if len(components) >= max_components:
        truncated = True
        warnings.append(
            f"Component sweep stopped at max_components={max_components}; repo may contain more."
        )
    if files_scanned >= max_files:
        truncated = True
        warnings.append(
            f"File sweep stopped at max_files={max_files}; repo may contain more."
        )

    patterns.uses_signals = signal_count > 0
    patterns.uses_observables = observable_count > 0
    patterns.uses_hooks = hook_count > 0
    patterns.uses_composition_api = composition_count > 0
    patterns.uses_rxjs = rxjs_count > 0
    patterns.angular_zoneless = zoneless_hits > 0
    if framework.name == "angular":
        if standalone_votes_true or standalone_votes_false:
            patterns.angular_standalone = standalone_votes_true >= standalone_votes_false
        if patterns.uses_signals and signal_count >= observable_count:
            patterns.state_style = "signals"
        elif patterns.uses_observables:
            patterns.state_style = "observables"
        else:
            patterns.state_style = "classic"
        patterns.rendering_style = "template"
    elif framework.name in {"react", "next"}:
        patterns.state_style = "hooks" if patterns.uses_hooks else "classic"
        patterns.rendering_style = "jsx"
    elif framework.name == "vue":
        patterns.state_style = "composition" if patterns.uses_composition_api else "classic"
        patterns.rendering_style = "sfc"
    elif framework.name == "svelte":
        patterns.state_style = "classic"
        patterns.rendering_style = "sfc"
    elif framework.name == "plain_html":
        patterns.state_style = "classic"
        patterns.rendering_style = "plain_html"
    else:
        patterns.state_style = "unknown"

    patterns.evidence = _build_pattern_evidence(
        signal_count=signal_count,
        observable_count=observable_count,
        hook_count=hook_count,
        composition_count=composition_count,
        rxjs_count=rxjs_count,
        zoneless_hits=zoneless_hits,
        standalone_votes_true=standalone_votes_true,
        standalone_votes_false=standalone_votes_false,
    )

    if naming_votes:
        conventions.naming_style = max(naming_votes.items(), key=lambda item: item[1])[0]
    if template_votes:
        conventions.template_style = max(template_votes.items(), key=lambda item: item[1])[0]
    if import_alias_hits > 0:
        conventions.import_style = "alias imports (@/, ~/) detected"
    conventions.notes = _build_convention_notes(framework, components)

    return components, patterns, conventions, files_scanned, truncated, warnings


def _build_pattern_evidence(
    *,
    signal_count: int,
    observable_count: int,
    hook_count: int,
    composition_count: int,
    rxjs_count: int,
    zoneless_hits: int,
    standalone_votes_true: int,
    standalone_votes_false: int,
) -> List[str]:
    evidence: List[str] = []
    if signal_count:
        evidence.append(f"{signal_count} file(s) reference signal()/computed()")
    if observable_count:
        evidence.append(f"{observable_count} file(s) reference Observable/subscribe")
    if hook_count:
        evidence.append(f"{hook_count} file(s) reference useState/useEffect/useMemo")
    if composition_count:
        evidence.append(
            f"{composition_count} file(s) use defineComponent or <script setup>"
        )
    if rxjs_count:
        evidence.append(f"{rxjs_count} file(s) import rxjs")
    if zoneless_hits:
        evidence.append(f"{zoneless_hits} file(s) reference zoneless change detection")
    if standalone_votes_true or standalone_votes_false:
        evidence.append(
            f"Angular standalone votes: true={standalone_votes_true}, false={standalone_votes_false}"
        )
    return evidence


def _extract_components_from_file(
    path: Path,
    rel_path: str,
    text: str,
    *,
    framework: FrameworkInfo,
) -> List[ComponentInfo]:
    components: List[ComponentInfo] = []
    suffix = path.suffix.lower()

    if suffix == ".ts" and _ANGULAR_COMPONENT_DECORATOR.search(text):
        components.extend(_extract_angular_components(rel_path, text))
    elif suffix == ".vue":
        components.extend(_extract_vue_components(rel_path, text))
    elif suffix == ".svelte":
        components.extend(_extract_svelte_components(rel_path, text))
    elif suffix in {".tsx", ".jsx"} and framework.name in {
        "react",
        "next",
        "unknown",
    }:
        components.extend(_extract_react_components(rel_path, text))
    return components


def _extract_angular_components(rel_path: str, text: str) -> List[ComponentInfo]:
    components: List[ComponentInfo] = []
    class_names = _ANGULAR_CLASS_NAME.findall(text)
    decorator_iter = list(_ANGULAR_COMPONENT_DECORATOR.finditer(text))
    for index, decorator_match in enumerate(decorator_iter):
        body = decorator_match.group(1)
        selector_match = _ANGULAR_SELECTOR.search(body)
        standalone_match = _ANGULAR_STANDALONE.search(body)
        standalone: Optional[bool] = None
        if standalone_match:
            standalone = standalone_match.group(1) == "true"
        class_name = class_names[index] if index < len(class_names) else "UnknownComponent"

        inputs = _extract_angular_inputs(text, class_name)

        components.append(
            ComponentInfo(
                name=class_name,
                selector=selector_match.group(1) if selector_match else None,
                file_path=rel_path,
                kind="angular_component",
                inputs=inputs,
                standalone=standalone,
                exported=True,
            )
        )
    return components


def _extract_angular_inputs(text: str, class_name: str) -> List[ComponentInput]:
    inputs: List[ComponentInput] = []
    seen: set[str] = set()
    for match in _ANGULAR_INPUT_DECORATOR.finditer(text):
        alias = match.group(1)
        name = alias or match.group(2)
        type_hint = match.group(3).strip().rstrip(";").rstrip(",")
        if name in seen:
            continue
        seen.add(name)
        inputs.append(
            ComponentInput(
                name=name,
                kind="input",
                type=type_hint or None,
                required=False,
            )
        )
    for match in _ANGULAR_INPUT_SIGNAL.finditer(text):
        name = match.group(1)
        type_hint = match.group(2).strip()
        if name in seen:
            continue
        seen.add(name)
        required = ".required" in text[max(match.start() - 20, 0) : match.start() + 40]
        inputs.append(
            ComponentInput(
                name=name,
                kind="input",
                type=type_hint,
                required=required,
            )
        )
    for match in _ANGULAR_MODEL_SIGNAL.finditer(text):
        name = match.group(1)
        type_hint = match.group(2).strip()
        if name in seen:
            continue
        seen.add(name)
        inputs.append(
            ComponentInput(
                name=name,
                kind="model",
                type=type_hint,
                required=False,
            )
        )
    return inputs


def _extract_react_components(rel_path: str, text: str) -> List[ComponentInfo]:
    components: List[ComponentInfo] = []
    props_types = {
        match.group(1): match.group(2)
        for match in _REACT_PROPS_TYPE.finditer(text)
    }

    def _inputs_for(props_type_name: Optional[str]) -> List[ComponentInput]:
        if not props_type_name:
            return []
        body = props_types.get(props_type_name)
        if not body:
            return []
        return _parse_object_props(body)

    for match in _REACT_COMPONENT_FN.finditer(text):
        name = match.group(1)
        params = match.group(2)
        inferred_props = _infer_react_props_name(params)
        components.append(
            ComponentInfo(
                name=name,
                selector=None,
                file_path=rel_path,
                kind="react_component",
                inputs=_inputs_for(inferred_props),
                standalone=None,
                exported=True,
            )
        )
    for match in _REACT_COMPONENT_CONST.finditer(text):
        name = match.group(1)
        generic = match.group(2)
        params = match.group(3)
        props_name = generic or _infer_react_props_name(params)
        components.append(
            ComponentInfo(
                name=name,
                selector=None,
                file_path=rel_path,
                kind="react_component",
                inputs=_inputs_for(props_name),
                standalone=None,
                exported=True,
            )
        )
    return components


def _infer_react_props_name(params: str) -> Optional[str]:
    match = re.search(r":\s*([A-Z][A-Za-z0-9_]+Props)", params)
    if match:
        return match.group(1)
    return None


def _parse_object_props(body: str) -> List[ComponentInput]:
    entries: List[ComponentInput] = []
    for line in body.split(";"):
        line = line.strip().rstrip(",").strip()
        if not line:
            continue
        match = re.match(r"([A-Za-z0-9_]+)(\??)\s*:\s*([^;]+)", line)
        if not match:
            continue
        name = match.group(1)
        required = match.group(2) != "?"
        type_hint = match.group(3).strip()
        entries.append(
            ComponentInput(name=name, kind="prop", type=type_hint, required=required)
        )
    return entries


def _extract_vue_components(rel_path: str, text: str) -> List[ComponentInfo]:
    components: List[ComponentInfo] = []
    name_match = _VUE_NAME.search(text)
    inferred_name = name_match.group(1) if name_match else Path(rel_path).stem
    inputs: List[ComponentInput] = []
    script_setup_match = _VUE_SCRIPT_SETUP.search(text)
    body_to_scan = script_setup_match.group(1) if script_setup_match else text
    props_match = _VUE_DEFINE_PROPS.search(body_to_scan)
    if props_match:
        props_body = props_match.group(1) or props_match.group(2) or ""
        inputs = _parse_object_props(props_body)

    components.append(
        ComponentInfo(
            name=inferred_name,
            selector=None,
            file_path=rel_path,
            kind="vue_component",
            inputs=inputs,
            standalone=None,
            exported=True,
        )
    )
    return components


def _extract_svelte_components(rel_path: str, text: str) -> List[ComponentInfo]:
    name = Path(rel_path).stem
    inputs: List[ComponentInput] = []
    for match in _SVELTE_EXPORT_LET.finditer(text):
        prop_name = match.group(1)
        type_hint = (match.group(2) or "").strip() or None
        inputs.append(ComponentInput(name=prop_name, kind="prop", type=type_hint))
    return [
        ComponentInfo(
            name=name,
            selector=None,
            file_path=rel_path,
            kind="svelte_component",
            inputs=inputs,
            standalone=None,
            exported=True,
        )
    ]


def _build_convention_notes(
    framework: FrameworkInfo,
    components: List[ComponentInfo],
) -> List[str]:
    notes: List[str] = []
    if framework.name == "angular":
        selectors = [c.selector for c in components if c.selector]
        if selectors:
            prefixes = {s.split("-")[0] for s in selectors if "-" in s}
            if len(prefixes) == 1:
                notes.append(
                    f"Angular selectors share prefix '{next(iter(prefixes))}-'."
                )
    if components:
        notes.append(
            f"{len(components)} reusable component(s) detected; prefer reuse over re-implementation."
        )
    return notes


def _summarize_folder_layout(root: Path) -> List[str]:
    top_level: List[str] = []
    src = root / "src"
    if src.exists() and src.is_dir():
        for child in sorted(src.iterdir()):
            if child.is_dir() and child.name not in IGNORE_DIRS:
                rel = f"src/{child.name}"
                top_level.append(rel)
                if child.name == "app":
                    for nested in sorted(child.iterdir()):
                        if nested.is_dir() and nested.name not in IGNORE_DIRS:
                            top_level.append(f"src/app/{nested.name}")
    else:
        for child in sorted(root.iterdir()):
            if child.is_dir() and child.name not in IGNORE_DIRS:
                top_level.append(child.name)
    return top_level[:30]


def _iter_files(
    root: Path, suffixes: Iterable[str], *, limit: int
) -> Iterable[Path]:
    suffix_set = {s.lower() for s in suffixes}
    count = 0
    stack: List[Path] = [root]
    while stack and count < limit:
        current = stack.pop()
        try:
            entries = list(current.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.is_dir():
                if entry.name in IGNORE_DIRS or entry.name.startswith("."):
                    if entry.name not in {".github"}:
                        continue
                stack.append(entry)
            elif entry.is_file() and entry.suffix.lower() in suffix_set:
                yield entry
                count += 1
                if count >= limit:
                    return
