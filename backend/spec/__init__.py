"""Design-spec extraction from generated HTML variants."""

from .models import (
    ComponentNode,
    DesignSpec,
    EventBinding,
    ReuseSuggestion,
    SpecDocument,
    StateHint,
    TokenUsage,
)
from .extractor import extract_design_spec

__all__ = [
    "ComponentNode",
    "DesignSpec",
    "EventBinding",
    "ReuseSuggestion",
    "SpecDocument",
    "StateHint",
    "TokenUsage",
    "extract_design_spec",
]
