from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from sessions.models import SessionStatus
from sessions.schemas import (
    CreateSessionRequest,
    RecordContextRequest,
    RecordVariantRequest,
    SelectVariantRequest,
    SessionContextResponse,
    SessionDetailResponse,
    SessionExportResponse,
    SessionVariantResponse,
    SessionsListResponse,
    UpdateSessionRequest,
)
from sessions.service import SessionNotFoundError, SessionService, session_service


router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_session_service() -> SessionService:
    return session_service


def _translate_not_found(error: SessionNotFoundError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=str(error),
    )


@router.post(
    "",
    response_model=SessionDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    payload: CreateSessionRequest,
    service: SessionService = Depends(get_session_service),
):
    bundle = await service.create_session(
        name=payload.name,
        stack=payload.stack,
        input_mode=payload.input_mode,
        metadata=payload.metadata,
    )
    return SessionDetailResponse.from_bundle(bundle)


@router.get("", response_model=SessionsListResponse)
async def list_sessions(
    status_filter: SessionStatus | None = Query(
        default=None, description="Filter by status"
    ),
    limit: int = Query(default=25, ge=1, le=100),
    service: SessionService = Depends(get_session_service),
):
    records = await service.list_sessions(status=status_filter, limit=limit)
    return SessionsListResponse.from_records(records)


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: str,
    service: SessionService = Depends(get_session_service),
):
    try:
        bundle = await service.get_session(session_id)
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    return SessionDetailResponse.from_bundle(bundle)


@router.patch("/{session_id}", response_model=SessionDetailResponse)
async def patch_session(
    session_id: str,
    payload: UpdateSessionRequest,
    service: SessionService = Depends(get_session_service),
):
    try:
        bundle = await service.update_session(
            session_id,
            name=payload.name,
            status=payload.status,
            metadata=payload.metadata,
        )
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    return SessionDetailResponse.from_bundle(bundle)


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def archive_session(
    session_id: str,
    service: SessionService = Depends(get_session_service),
) -> Response:
    try:
        await service.archive_session(session_id)
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{session_id}/context",
    response_model=SessionContextResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_context(
    session_id: str,
    payload: RecordContextRequest,
    service: SessionService = Depends(get_session_service),
):
    try:
        record = await service.add_context(
            session_id,
            context_type=payload.context_type,
            payload=payload.payload,
        )
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    return SessionContextResponse.from_record(record)


@router.post(
    "/{session_id}/variants",
    response_model=SessionVariantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_variant(
    session_id: str,
    payload: RecordVariantRequest,
    service: SessionService = Depends(get_session_service),
):
    try:
        record = await service.add_variant(
            session_id,
            variant_index=payload.variant_index,
            model=payload.model,
            code=payload.code,
            status=payload.status,
            metadata=payload.metadata,
        )
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    return SessionVariantResponse.from_record(record)


@router.post(
    "/{session_id}/select",
    response_model=SessionDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def select_variant(
    session_id: str,
    payload: SelectVariantRequest,
    service: SessionService = Depends(get_session_service),
):
    try:
        bundle = await service.select_variant(
            session_id,
            variant_id=payload.variant_id,
            variant_index=payload.variant_index,
        )
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
        ) from error
    return SessionDetailResponse.from_bundle(bundle)


@router.get(
    "/{session_id}/export",
    response_model=SessionExportResponse,
)
async def export_session(
    session_id: str,
    service: SessionService = Depends(get_session_service),
):
    try:
        bundle = await service.get_session(session_id)
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    return SessionExportResponse.from_bundle(bundle)
