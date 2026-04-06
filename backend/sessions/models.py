from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional


class SessionStatus(str, Enum):
    NEW = "new"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class VariantStatus(str, Enum):
    PENDING = "pending"
    COMPLETE = "complete"
    ERROR = "error"


@dataclass(slots=True)
class SessionRecord:
    id: str
    name: str
    status: SessionStatus
    stack: Optional[str]
    input_mode: Optional[str]
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    selected_variant_id: Optional[str]
    last_context_at: Optional[datetime]
    last_variant_at: Optional[datetime]


@dataclass(slots=True)
class SessionContextRecord:
    id: str
    session_id: str
    context_type: str
    payload: Dict[str, Any]
    created_at: datetime


@dataclass(slots=True)
class SessionVariantRecord:
    id: str
    session_id: str
    variant_index: int
    model: str
    code: str
    status: VariantStatus
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class SessionBundle:
    session: SessionRecord
    contexts: list[SessionContextRecord]
    variants: list[SessionVariantRecord]

