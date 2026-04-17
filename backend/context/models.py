from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class FrameworkInfo(BaseModel):
    name: str = Field(
        description="One of 'angular', 'react', 'vue', 'svelte', 'next', 'plain_html', 'python', 'unknown'."
    )
    version: Optional[str] = None
    language: Optional[str] = Field(
        default=None,
        description="Primary language detected (typescript, javascript, python, html, ...).",
    )
    package_manager: Optional[str] = None
    build_tool: Optional[str] = None
    evidence: List[str] = Field(
        default_factory=list,
        description="Human-readable list of files or config hints that led to the classification.",
    )


class ComponentInput(BaseModel):
    name: str
    kind: str = Field(description="One of 'input', 'model', 'prop', 'attr', 'arg'.")
    type: Optional[str] = None
    required: bool = False


def _empty_inputs() -> list[ComponentInput]:
    return []


class ComponentInfo(BaseModel):
    name: str
    selector: Optional[str] = None
    file_path: str
    kind: str = Field(
        description="One of 'angular_component', 'react_component', 'vue_component', 'svelte_component', 'unknown'."
    )
    inputs: List[ComponentInput] = Field(default_factory=_empty_inputs)
    standalone: Optional[bool] = None
    exported: bool = True


class CssTokens(BaseModel):
    tailwind_config_path: Optional[str] = None
    tailwind_theme_keys: List[str] = Field(default_factory=list)
    tailwind_colors: Dict[str, Any] = Field(default_factory=dict)
    tailwind_spacing: Dict[str, Any] = Field(default_factory=dict)
    tailwind_custom_classes: List[str] = Field(default_factory=list)
    css_custom_properties: Dict[str, str] = Field(default_factory=dict)
    scss_variables: Dict[str, str] = Field(default_factory=dict)
    token_sources: List[str] = Field(default_factory=list)


class PatternSignals(BaseModel):
    uses_signals: bool = False
    uses_observables: bool = False
    uses_hooks: bool = False
    uses_composition_api: bool = False
    uses_rxjs: bool = False
    angular_standalone: Optional[bool] = None
    angular_zoneless: bool = False
    state_style: Optional[str] = Field(
        default=None,
        description="Best-guess state idiom: 'signals', 'observables', 'hooks', 'composition', 'classic', or 'unknown'.",
    )
    rendering_style: Optional[str] = Field(
        default=None,
        description="'template', 'jsx', 'sfc', or 'plain_html'.",
    )
    evidence: List[str] = Field(default_factory=list)


class ConventionsSummary(BaseModel):
    naming_style: Optional[str] = Field(
        default=None,
        description="Best-guess naming idiom (kebab-case files, PascalCase components, ...).",
    )
    folder_layout: List[str] = Field(
        default_factory=list,
        description="Notable directories found at the root (e.g. 'src/app/shared', 'src/components').",
    )
    import_style: Optional[str] = Field(
        default=None,
        description="Short summary of import idiom (e.g. 'alias @/*, relative within feature').",
    )
    template_style: Optional[str] = None
    notes: List[str] = Field(default_factory=list)


def _empty_components() -> list[ComponentInfo]:
    return []


class ProjectContext(BaseModel):
    repo_path: str
    framework: FrameworkInfo
    components: List[ComponentInfo] = Field(default_factory=_empty_components)
    css_tokens: CssTokens = Field(default_factory=CssTokens)
    patterns: PatternSignals = Field(default_factory=PatternSignals)
    conventions: ConventionsSummary = Field(default_factory=ConventionsSummary)
    files_scanned: int = 0
    truncated: bool = Field(
        default=False,
        description="Set when the scanner hit its file-count budget and stopped early.",
    )
    warnings: List[str] = Field(default_factory=list)

    def to_context_payload(self) -> Dict[str, Any]:
        return self.model_dump(mode="json")
