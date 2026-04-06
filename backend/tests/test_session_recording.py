from __future__ import annotations

import pytest

from llm import Llm
from routes.generate_code import ExtractedParams, record_variants_for_session
from sessions.models import SessionStatus
from sessions.service import SessionService
from sessions.store import SessionStore


@pytest.mark.asyncio
async def test_record_variants_for_session(tmp_path, monkeypatch) -> None:
    store = SessionStore(tmp_path / "record.db")
    service = SessionService(store)
    monkeypatch.setattr("sessions.service.session_service", service)
    monkeypatch.setattr("routes.generate_code.session_service", service)

    bundle = store.create_session(
        name="Record Variants",
        stack="react_tailwind",
        input_mode="image",
        metadata={},
    )

    extracted = ExtractedParams(
        stack="react_tailwind",
        input_mode="image",
        should_generate_images=True,
        openai_api_key=None,
        anthropic_api_key=None,
        gemini_api_key=None,
        openai_base_url=None,
        generation_type="create",
        prompt={"text": "Build component", "images": [], "videos": []},
        history=[],
        file_state=None,
        option_codes=["baseline"],
        session_id=bundle.session.id,
    )

    await record_variants_for_session(
        session_id=bundle.session.id,
        variant_models=[Llm.GPT_4_1_2025_04_14],
        variant_completions={0: "<div>Variant</div>"},
        extracted_params=extracted,
    )

    updated_bundle = store.get_session_bundle(bundle.session.id)
    assert len(updated_bundle.variants) == 1
    assert updated_bundle.variants[0].code.startswith("<div>")
    assert (
        updated_bundle.variants[0].metadata["generationType"]
        == extracted.generation_type
    )
    assert updated_bundle.session.status == SessionStatus.NEW
