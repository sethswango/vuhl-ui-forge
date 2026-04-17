from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EventBinding(BaseModel):
    element: str
    event: str
    handler: Optional[str] = None
    element_path: Optional[str] = None


class StateHint(BaseModel):
    kind: str = Field(
        description="One of 'list', 'form_input', 'toggle', 'async_data', 'selection', 'counter', or 'custom'."
    )
    summary: str
    element_path: Optional[str] = None


class TokenUsage(BaseModel):
    colors: List[str] = Field(default_factory=list)
    tailwind_classes: List[str] = Field(default_factory=list)
    custom_properties: List[str] = Field(default_factory=list)
    hardcoded_pixels: List[str] = Field(default_factory=list)
    fonts: List[str] = Field(default_factory=list)


class ReuseSuggestion(BaseModel):
    component_name: str
    component_selector: Optional[str] = None
    component_file: Optional[str] = None
    rationale: str
    matched_element_path: Optional[str] = None
    confidence: str = Field(default="medium", description="'low', 'medium', or 'high'.")


def _empty_children() -> list["ComponentNode"]:
    return []


def _empty_event_bindings() -> list["EventBinding"]:
    return []


def _empty_state_hints() -> list["StateHint"]:
    return []


def _empty_reuse_suggestions() -> list["ReuseSuggestion"]:
    return []


class ComponentNode(BaseModel):
    tag: str
    role: Optional[str] = None
    classes: List[str] = Field(default_factory=list)
    text: Optional[str] = None
    attributes: Dict[str, str] = Field(default_factory=dict)
    children: List["ComponentNode"] = Field(default_factory=_empty_children)
    path: str = Field(
        description="DOM path for cross-referencing, e.g. 'body>main>section[0]'.",
    )


ComponentNode.model_rebuild()


class DesignSpec(BaseModel):
    session_id: str
    variant_index: int
    model: Optional[str] = None
    summary: str
    component_tree: ComponentNode
    tokens_used: TokenUsage = Field(default_factory=TokenUsage)
    event_bindings: List[EventBinding] = Field(default_factory=_empty_event_bindings)
    state_hints: List[StateHint] = Field(default_factory=_empty_state_hints)
    reuse_suggestions: List[ReuseSuggestion] = Field(
        default_factory=_empty_reuse_suggestions
    )
    new_components_needed: List[str] = Field(default_factory=list)
    alignment_notes: List[str] = Field(
        default_factory=list,
        description="Explicit 'align better than the spec did' reminders for the implementer.",
    )
    project_context_used: bool = False
    project_context_fingerprint: Optional[str] = None

    def to_payload(self) -> Dict[str, Any]:
        return self.model_dump(mode="json")


class SpecDocument(BaseModel):
    spec: DesignSpec
    annotated_markdown: str

    def to_payload(self) -> Dict[str, Any]:
        return {
            "spec": self.spec.to_payload(),
            "annotated_markdown": self.annotated_markdown,
        }
