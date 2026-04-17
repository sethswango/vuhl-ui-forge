from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from context import scan_project_context
from context.models import ProjectContext
from sessions.models import SessionBundle, SessionStatus, SessionVariantRecord
from sessions.schemas import (
    CreateSessionRequest,
    ExtractDesignSpecRequest,
    ExtractDesignSpecResponse,
    GatherProjectContextRequest,
    GatherProjectContextResponse,
    RecordContextRequest,
    RecordVariantRequest,
    RefineVariantRequest,
    RefineVariantResponse,
    SelectVariantRequest,
    SessionContextResponse,
    SessionDetailResponse,
    SessionExportResponse,
    SessionVariantResponse,
    SessionsListResponse,
    UpdateSessionRequest,
)
from sessions.service import SessionNotFoundError, SessionService, session_service
from spec import extract_design_spec


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


@router.post(
    "/{session_id}/context/project",
    response_model=GatherProjectContextResponse,
    status_code=status.HTTP_201_CREATED,
)
async def gather_project_context(
    session_id: str,
    payload: GatherProjectContextRequest,
    service: SessionService = Depends(get_session_service),
):
    try:
        await service.get_session(session_id)
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error

    scan_kwargs: dict[str, int] = {}
    if payload.max_files is not None:
        scan_kwargs["max_files"] = payload.max_files
    if payload.max_components is not None:
        scan_kwargs["max_components"] = payload.max_components

    try:
        project = scan_project_context(payload.repo_path, **scan_kwargs)
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
        ) from error
    except NotADirectoryError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)
        ) from error

    stored_payload: dict[str, object] = {
        "source": "gather_project_context",
        "repo_path": project.repo_path,
        "project_context": project.to_context_payload(),
    }
    if payload.label:
        stored_payload["label"] = payload.label

    try:
        record = await service.add_context(
            session_id,
            context_type="project",
            payload=stored_payload,
        )
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error
    return GatherProjectContextResponse(
        context=SessionContextResponse.from_record(record),
        project_context=project.to_context_payload(),
    )


def _pick_variant(
    bundle: SessionBundle,
    *,
    variant_index: int | None,
    variant_id: str | None,
) -> SessionVariantRecord | None:
    matches = list(bundle.variants)
    if variant_id is not None:
        for candidate in matches:
            if candidate.id == variant_id:
                return candidate
        return None
    if variant_index is not None:
        latest: SessionVariantRecord | None = None
        for candidate in matches:
            if candidate.variant_index == variant_index:
                if latest is None or candidate.created_at >= latest.created_at:
                    latest = candidate
        return latest
    return None


def _latest_project_context(bundle: SessionBundle) -> ProjectContext | None:
    for record in reversed(bundle.contexts):
        if record.context_type != "project":
            continue
        raw = record.payload.get("project_context")
        if not isinstance(raw, dict):
            continue
        try:
            return ProjectContext.model_validate(raw)
        except Exception:
            continue
    return None


@router.post(
    "/{session_id}/spec",
    response_model=ExtractDesignSpecResponse,
    status_code=status.HTTP_200_OK,
)
async def extract_spec(
    session_id: str,
    payload: ExtractDesignSpecRequest,
    service: SessionService = Depends(get_session_service),
):
    try:
        bundle = await service.get_session(session_id)
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error

    variant = _pick_variant(
        bundle,
        variant_index=payload.variant_index,
        variant_id=payload.variant_id,
    )
    if variant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variant not found on this session.",
        )

    project_context = _latest_project_context(bundle)
    document = extract_design_spec(
        session_id=session_id,
        variant_index=variant.variant_index,
        html=variant.code,
        model=variant.model,
        project_context=project_context,
    )

    context_record = None
    if payload.persist_as_context:
        try:
            record = await service.add_context(
                session_id,
                context_type="design_spec",
                payload={
                    "variant_index": variant.variant_index,
                    "variant_id": variant.id,
                    "spec": document.spec.to_payload(),
                    "annotated_markdown": document.annotated_markdown,
                },
            )
            context_record = SessionContextResponse.from_record(record)
        except SessionNotFoundError as error:
            raise _translate_not_found(error) from error

    return ExtractDesignSpecResponse(
        session_id=session_id,
        variant_index=variant.variant_index,
        variant_id=variant.id,
        spec=document.spec.to_payload(),
        annotated_markdown=document.annotated_markdown,
        context_record=context_record,
    )


@router.post(
    "/{session_id}/refine",
    response_model=RefineVariantResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def refine_variant(
    session_id: str,
    payload: RefineVariantRequest,
    service: SessionService = Depends(get_session_service),
):
    try:
        bundle = await service.get_session(session_id)
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error

    has_variant = any(
        candidate.variant_index == payload.variant_index for candidate in bundle.variants
    )
    if not has_variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No recorded variant at index {payload.variant_index} for session"
                f" {session_id}. Generate or record a variant first."
            ),
        )

    try:
        record = await service.queue_refinement(
            session_id,
            variant_index=payload.variant_index,
            text=payload.text,
            image_data_url=payload.image_data_url,
        )
    except SessionNotFoundError as error:
        raise _translate_not_found(error) from error

    refinement_id = str(record.payload.get("refinement_id", record.id))
    return RefineVariantResponse(
        session_id=session_id,
        variant_index=payload.variant_index,
        refinement_id=refinement_id,
        status="queued",
        stream_hint={
            "channel": "websocket",
            "endpoint": "/generate-code",
            "instructions": (
                "Send the existing /generate-code WebSocket payload with"
                " generationType='update' and sessionId set; include the queued"
                " refinement text/image under params. The existing pipeline"
                " streams back into the same variant slot — no new channel."
            ),
        },
        context_record=SessionContextResponse.from_record(record),
    )
