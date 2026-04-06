from __future__ import annotations

import asyncio
from typing import Any, Optional

from .models import (
    SessionBundle,
    SessionContextRecord,
    SessionRecord,
    SessionStatus,
    SessionVariantRecord,
    VariantStatus,
)
from .store import SessionStore


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


session_service = SessionService(SessionStore())

