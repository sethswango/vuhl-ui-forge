from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any, Optional
from uuid import uuid4

from .models import (
    SessionBundle,
    SessionContextRecord,
    SessionRecord,
    SessionStatus,
    SessionVariantRecord,
    VariantStatus,
)
from .store import SessionStore

if TYPE_CHECKING:
    from context.models import ProjectContext


def latest_project_context(bundle: SessionBundle) -> "ProjectContext | None":
    """Return the most recent project context captured on a session, if any.

    Walks ``bundle.contexts`` newest-first looking for ``context_type="project"``
    records and returns a validated :class:`ProjectContext` for the first one
    that parses. Silently skips malformed payloads so a single corrupt record
    never hides a later healthy one. Import is lazy to keep the sessions
    package independent of the context package at module import time (keeps
    circular-import surface small even though there isn't one today).
    """
    from context.models import ProjectContext

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


class SessionNotFoundError(Exception):
    def __init__(self, session_id: str):
        super().__init__(f"Session {session_id} not found")
        self.session_id = session_id


class SessionService:
    """Async-friendly facade around the SQLite session store."""

    def __init__(self, store: SessionStore):
        self._store = store

    async def create_session(
        self,
        *,
        name: str,
        stack: str | None,
        input_mode: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> SessionBundle:
        return await asyncio.to_thread(
            self._store.create_session,
            name=name,
            stack=stack,
            input_mode=input_mode,
            metadata=metadata,
        )

    async def get_session(self, session_id: str) -> SessionBundle:
        try:
            return await asyncio.to_thread(self._store.get_session_bundle, session_id)
        except KeyError as exc:
            raise SessionNotFoundError(session_id) from exc

    async def list_sessions(
        self,
        *,
        status: SessionStatus | None = None,
        limit: int = 25,
    ) -> list[SessionRecord]:
        return await asyncio.to_thread(
            self._store.list_sessions,
            status=status,
            limit=limit,
        )

    async def update_session(
        self,
        session_id: str,
        *,
        name: Optional[str] = None,
        status: Optional[SessionStatus] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> SessionBundle:
        try:
            return await asyncio.to_thread(
                self._store.update_session,
                session_id,
                name=name,
                status=status,
                metadata=metadata,
            )
        except KeyError as exc:
            raise SessionNotFoundError(session_id) from exc

    async def archive_session(self, session_id: str) -> None:
        try:
            await asyncio.to_thread(self._store.archive_session, session_id)
        except KeyError as exc:
            raise SessionNotFoundError(session_id) from exc

    async def add_context(
        self,
        session_id: str,
        *,
        context_type: str,
        payload: dict[str, Any],
    ) -> SessionContextRecord:
        try:
            return await asyncio.to_thread(
                self._store.create_context,
                session_id,
                context_type=context_type,
                payload=payload,
            )
        except KeyError as exc:
            raise SessionNotFoundError(session_id) from exc

    async def add_variant(
        self,
        session_id: str,
        *,
        variant_index: int,
        model: str,
        code: str,
        status: VariantStatus,
        metadata: dict[str, Any],
    ) -> SessionVariantRecord:
        try:
            return await asyncio.to_thread(
                self._store.add_variant,
                session_id,
                variant_index=variant_index,
                model=model,
                code=code,
                status=status,
                metadata=metadata,
            )
        except KeyError as exc:
            raise SessionNotFoundError(session_id) from exc

    async def select_variant(
        self,
        session_id: str,
        *,
        variant_id: str | None = None,
        variant_index: int | None = None,
    ) -> SessionBundle:
        try:
            return await asyncio.to_thread(
                self._store.select_variant,
                session_id,
                variant_id=variant_id,
                variant_index=variant_index,
            )
        except KeyError as exc:
            raise SessionNotFoundError(session_id) from exc

    async def queue_refinement(
        self,
        session_id: str,
        *,
        variant_index: int,
        text: Optional[str],
        image_data_url: Optional[str],
    ) -> SessionContextRecord:
        """Queue a refinement request that the existing WebSocket pipeline reads.

        A refinement is stored as a session context record with
        ``context_type = 'refinement_queue'``. The frontend's WebSocket flow
        (or an MCP-aware equivalent) drains the queue by issuing a regular
        ``/generate-code`` WS call with ``generationType = 'update'`` and
        ``sessionId`` set. This intentionally avoids introducing a second
        streaming channel.
        """
        refinement_id = str(uuid4())
        payload: dict[str, Any] = {
            "refinement_id": refinement_id,
            "variant_index": variant_index,
            "text": text,
            "has_image": image_data_url is not None,
            "image_data_url": image_data_url,
            "status": "queued",
        }
        try:
            return await asyncio.to_thread(
                self._store.create_context,
                session_id,
                context_type="refinement_queue",
                payload=payload,
            )
        except KeyError as exc:
            raise SessionNotFoundError(session_id) from exc


session_service = SessionService(SessionStore())

