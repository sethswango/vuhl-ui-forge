from __future__ import annotations

from pathlib import Path
from typing import cast

from sessions.models import SessionStatus, VariantStatus
from sessions.store import SessionStore


def test_session_store_round_trip(tmp_path) -> None:
    tmp_dir = cast(Path, tmp_path)
    db_path: Path = tmp_dir / "sessions.db"
    store = SessionStore(db_path)

    bundle = store.create_session(
        name="Fee Comparison",
        stack="html_tailwind",
        input_mode="image",
        metadata={"project": "title-portal"},
    )
    assert bundle.session.status == SessionStatus.NEW

    context = store.create_context(
        bundle.session.id,
        context_type="project",
        payload={"module": "fee-comparison"},
    )
    assert context.payload["module"] == "fee-comparison"

    variant = store.add_variant(
        bundle.session.id,
        variant_index=0,
        model="gpt-5.4",
        code="<div>Variant</div>",
        status=VariantStatus.COMPLETE,
        metadata={"stack": "html_tailwind"},
    )
    assert variant.variant_index == 0

    updated_bundle = store.select_variant(
        bundle.session.id,
        variant_id=variant.id,
    )
    assert updated_bundle.session.selected_variant_id == variant.id
    assert updated_bundle.session.status == SessionStatus.COMPLETED


def test_list_sessions_filters_by_status(tmp_path) -> None:
    tmp_dir = cast(Path, tmp_path)
    db_path: Path = tmp_dir / "sessions.db"
    store = SessionStore(db_path)

    first = store.create_session(
        name="Active Session",
        stack=None,
        input_mode=None,
        metadata={},
    )
    store.create_session(
        name="Second Session",
        stack=None,
        input_mode=None,
        metadata={},
    )
    store.update_session(
        first.session.id,
        status=SessionStatus.COMPLETED,
    )

    completed = store.list_sessions(status=SessionStatus.COMPLETED)
    assert len(completed) == 1
    assert completed[0].status == SessionStatus.COMPLETED
