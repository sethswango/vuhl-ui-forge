from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional
from uuid import uuid4

from .models import (
    SessionBundle,
    SessionContextRecord,
    SessionRecord,
    SessionStatus,
    SessionVariantRecord,
    VariantStatus,
)


DEFAULT_DB_PATH = Path(
    os.environ.get(
        "SESSION_DB_PATH",
        Path(__file__).resolve().parent / "session_store.db",
    )
)


def _ensure_directory(path: Path) -> None:
    if path.parent.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value)


class SessionStore:
    """Simple SQLite-backed persistence for sessions, contexts, and variants."""

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        _ensure_directory(self.db_path)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._initialize()

    def _initialize(self) -> None:
        with self._conn:
            self._conn.execute("PRAGMA foreign_keys = ON;")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    stack TEXT,
                    input_mode TEXT,
                    metadata TEXT NOT NULL,
                    selected_variant_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_context_at TEXT,
                    last_variant_at TEXT
                );
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_context (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    context_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_variants (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    variant_index INTEGER NOT NULL,
                    model TEXT NOT NULL,
                    code TEXT NOT NULL,
                    status TEXT NOT NULL,
                    metadata TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
                """
            )

    def _row_to_session(self, row: sqlite3.Row) -> SessionRecord:
        return SessionRecord(
            id=row["id"],
            name=row["name"],
            status=SessionStatus(row["status"]),
            stack=row["stack"],
            input_mode=row["input_mode"],
            metadata=json.loads(row["metadata"]),
            selected_variant_id=row["selected_variant_id"],
            created_at=_parse_timestamp(row["created_at"]) or _utcnow(),
            updated_at=_parse_timestamp(row["updated_at"]) or _utcnow(),
            last_context_at=_parse_timestamp(row["last_context_at"]),
            last_variant_at=_parse_timestamp(row["last_variant_at"]),
        )

    def _row_to_context(self, row: sqlite3.Row) -> SessionContextRecord:
        return SessionContextRecord(
            id=row["id"],
            session_id=row["session_id"],
            context_type=row["context_type"],
            payload=json.loads(row["payload"]),
            created_at=_parse_timestamp(row["created_at"]) or _utcnow(),
        )

    def _row_to_variant(self, row: sqlite3.Row) -> SessionVariantRecord:
        return SessionVariantRecord(
            id=row["id"],
            session_id=row["session_id"],
            variant_index=row["variant_index"],
            model=row["model"],
            code=row["code"],
            status=VariantStatus(row["status"]),
            metadata=json.loads(row["metadata"]),
            created_at=_parse_timestamp(row["created_at"]) or _utcnow(),
            updated_at=_parse_timestamp(row["updated_at"]) or _utcnow(),
        )

    def create_session(
        self,
        *,
        name: str,
        stack: Optional[str],
        input_mode: Optional[str],
        metadata: Optional[dict[str, Any]] = None,
    ) -> SessionBundle:
        now = _utcnow().isoformat()
        session_id = str(uuid4())
        payload = json.dumps(metadata or {})
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO sessions (
                    id, name, status, stack, input_mode, metadata,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    session_id,
                    name,
                    SessionStatus.NEW.value,
                    stack,
                    input_mode,
                    payload,
                    now,
                    now,
                ),
            )
        return self.get_session_bundle(session_id)

    def update_session(
        self,
        session_id: str,
        *,
        name: Optional[str] = None,
        status: Optional[SessionStatus] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> SessionBundle:
        updates: list[str] = []
        params: list[Any] = []
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if status is not None:
            updates.append("status = ?")
            params.append(status.value)
        if metadata is not None:
            updates.append("metadata = ?")
            params.append(json.dumps(metadata))
        if not updates:
            return self.get_session_bundle(session_id)

        updates.append("updated_at = ?")
        params.append(_utcnow().isoformat())
        params.append(session_id)

        with self._lock, self._conn:
            cursor = self._conn.execute(
                f"UPDATE sessions SET {', '.join(updates)} WHERE id = ?",
                params,
            )
        if cursor.rowcount == 0:
            raise KeyError(session_id)
        return self.get_session_bundle(session_id)

    def archive_session(self, session_id: str) -> None:
        with self._lock, self._conn:
            cursor = self._conn.execute(
                """
                UPDATE sessions
                SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                (SessionStatus.ARCHIVED.value, _utcnow().isoformat(), session_id),
            )
        if cursor.rowcount == 0:
            raise KeyError(session_id)

    def list_sessions(
        self,
        *,
        status: Optional[SessionStatus] = None,
        limit: int = 25,
    ) -> list[SessionRecord]:
        query = "SELECT * FROM sessions"
        params: list[Any] = []
        if status is not None:
            query += " WHERE status = ?"
            params.append(status.value)
        query += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        cursor = self._conn.execute(query, params)
        rows = cursor.fetchall()
        return [self._row_to_session(row) for row in rows]

    def get_session_bundle(self, session_id: str) -> SessionBundle:
        session_cursor = self._conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        )
        session_row = session_cursor.fetchone()
        if not session_row:
            raise KeyError(session_id)

        context_cursor = self._conn.execute(
            """
            SELECT * FROM session_context
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        contexts = [self._row_to_context(row) for row in context_cursor.fetchall()]

        variant_cursor = self._conn.execute(
            """
            SELECT * FROM session_variants
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        variants = [self._row_to_variant(row) for row in variant_cursor.fetchall()]

        return SessionBundle(
            session=self._row_to_session(session_row),
            contexts=contexts,
            variants=variants,
        )

    def create_context(
        self,
        session_id: str,
        *,
        context_type: str,
        payload: dict[str, Any],
    ) -> SessionContextRecord:
        now = _utcnow().isoformat()
        context_id = str(uuid4())
        data = json.dumps(payload)
        with self._lock, self._conn:
            cursor = self._conn.execute(
                "SELECT id FROM sessions WHERE id = ?",
                (session_id,),
            )
            if cursor.fetchone() is None:
                raise KeyError(session_id)
            self._conn.execute(
                """
                INSERT INTO session_context (
                    id, session_id, context_type, payload, created_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (context_id, session_id, context_type, data, now),
            )
            self._conn.execute(
                """
                UPDATE sessions
                SET last_context_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, session_id),
            )
        cursor = self._conn.execute(
            "SELECT * FROM session_context WHERE id = ?", (context_id,)
        )
        row = cursor.fetchone()
        assert row is not None
        return self._row_to_context(row)

    def add_variant(
        self,
        session_id: str,
        *,
        variant_index: int,
        model: str,
        code: str,
        status: VariantStatus,
        metadata: dict[str, Any],
    ) -> SessionVariantRecord:
        now = _utcnow().isoformat()
        variant_id = str(uuid4())
        data = json.dumps(metadata or {})
        with self._lock, self._conn:
            cursor = self._conn.execute(
                "SELECT id FROM sessions WHERE id = ?",
                (session_id,),
            )
            if cursor.fetchone() is None:
                raise KeyError(session_id)
            self._conn.execute(
                """
                INSERT INTO session_variants (
                    id, session_id, variant_index, model,
                    code, status, metadata, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    variant_id,
                    session_id,
                    variant_index,
                    model,
                    code,
                    status.value,
                    data,
                    now,
                    now,
                ),
            )
            self._conn.execute(
                """
                UPDATE sessions
                SET last_variant_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, session_id),
            )

        cursor = self._conn.execute(
            "SELECT * FROM session_variants WHERE id = ?",
            (variant_id,),
        )
        row = cursor.fetchone()
        assert row is not None
        return self._row_to_variant(row)

    def select_variant(
        self,
        session_id: str,
        *,
        variant_id: Optional[str] = None,
        variant_index: Optional[int] = None,
    ) -> SessionBundle:
        if variant_id is None and variant_index is None:
            raise ValueError("variant_id or variant_index is required")

        if variant_id is None:
            cursor = self._conn.execute(
                """
                SELECT id FROM session_variants
                WHERE session_id = ? AND variant_index = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (session_id, variant_index),
            )
            row = cursor.fetchone()
            if row is None:
                raise KeyError(f"{session_id}:{variant_index}")
            variant_id = row["id"]

        now = _utcnow().isoformat()
        with self._lock, self._conn:
            cursor = self._conn.execute(
                """
                UPDATE sessions
                SET selected_variant_id = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (variant_id, SessionStatus.COMPLETED.value, now, session_id),
            )
        if cursor.rowcount == 0:
            raise KeyError(session_id)
        return self.get_session_bundle(session_id)

