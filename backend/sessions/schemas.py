from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, RootModel, model_validator

from .models import (
    SessionBundle,
    SessionContextRecord,
    SessionRecord,
    SessionStatus,
    SessionVariantRecord,
    VariantStatus,
)


class CreateSessionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    stack: str | None = None
    input_mode: str | None = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class UpdateSessionRequest(BaseModel):
    name: str | None = None
    status: SessionStatus | None = None
    metadata: Dict[str, Any] | None = None

    @model_validator(mode="after")
    def ensure_updates(self) -> "UpdateSessionRequest":
        if self.name is None and self.status is None and self.metadata is None:
            raise ValueError("At least one field must be provided")
        return self


class RecordContextRequest(BaseModel):
    context_type: str = Field(default="gathered")
    payload: Dict[str, Any] = Field(default_factory=dict)


class RecordVariantRequest(BaseModel):
    variant_index: int = Field(..., ge=0)
    model: str
    code: str
    status: VariantStatus = VariantStatus.COMPLETE
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SelectVariantRequest(BaseModel):
    variant_id: str | None = None
    variant_index: int | None = None

    @model_validator(mode="after")
    def require_identifier(self) -> "SelectVariantRequest":
        if self.variant_id is None and self.variant_index is None:
            raise ValueError("variant_id or variant_index is required")
        return self


class SessionContextResponse(BaseModel):
    id: str
    context_type: str
    payload: Dict[str, Any]
    created_at: datetime

    @classmethod
    def from_record(cls, record: SessionContextRecord) -> "SessionContextResponse":
        return cls(
            id=record.id,
            context_type=record.context_type,
            payload=record.payload,
            created_at=record.created_at,
        )


class SessionVariantResponse(BaseModel):
    id: str
    variant_index: int
    model: str
    code: str
    status: VariantStatus
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_record(cls, record: SessionVariantRecord) -> "SessionVariantResponse":
        return cls(
            id=record.id,
            variant_index=record.variant_index,
            model=record.model,
            code=record.code,
            status=record.status,
            metadata=record.metadata,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )


class SessionSummary(BaseModel):
    id: str
    name: str
    status: SessionStatus
    stack: str | None
    input_mode: str | None
    metadata: Dict[str, Any]
    selected_variant_id: str | None
    created_at: datetime
    updated_at: datetime
    last_context_at: datetime | None
    last_variant_at: datetime | None

    @classmethod
    def from_record(cls, record: SessionRecord) -> "SessionSummary":
        return cls(
            id=record.id,
            name=record.name,
            status=record.status,
            stack=record.stack,
            input_mode=record.input_mode,
            metadata=record.metadata,
            selected_variant_id=record.selected_variant_id,
            created_at=record.created_at,
            updated_at=record.updated_at,
            last_context_at=record.last_context_at,
            last_variant_at=record.last_variant_at,
        )


class SessionDetailResponse(BaseModel):
    session: SessionSummary
    contexts: List[SessionContextResponse]
    variants: List[SessionVariantResponse]

    @classmethod
    def from_bundle(cls, bundle: SessionBundle) -> "SessionDetailResponse":
        return cls(
            session=SessionSummary.from_record(bundle.session),
            contexts=[
                SessionContextResponse.from_record(record)
                for record in bundle.contexts
            ],
            variants=[
                SessionVariantResponse.from_record(record)
                for record in bundle.variants
            ],
        )


class SessionsListResponse(RootModel[list[SessionSummary]]):
    @classmethod
    def from_records(cls, records: list[SessionRecord]) -> "SessionsListResponse":
        return cls([SessionSummary.from_record(record) for record in records])


class SessionExportResponse(BaseModel):
    session: SessionSummary
    contexts: List[SessionContextResponse]
    variants: List[SessionVariantResponse]
    selected_variant: Optional[SessionVariantResponse] = None

    @classmethod
    def from_bundle(cls, bundle: SessionBundle) -> "SessionExportResponse":
        selected = None
        if bundle.session.selected_variant_id:
            for variant in bundle.variants:
                if variant.id == bundle.session.selected_variant_id:
                    selected = SessionVariantResponse.from_record(variant)
                    break
        return cls(
            session=SessionSummary.from_record(bundle.session),
            contexts=[
                SessionContextResponse.from_record(record)
                for record in bundle.contexts
            ],
            variants=[
                SessionVariantResponse.from_record(record)
                for record in bundle.variants
            ],
            selected_variant=selected,
        )

