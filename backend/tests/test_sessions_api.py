from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from sessions.service import SessionService
from sessions.store import SessionStore


def create_test_client(tmp_path, monkeypatch) -> TestClient:
    store = SessionStore(tmp_path / "api_sessions.db")
    service = SessionService(store)
    # Ensure every module uses the same in-memory service for the test run
    monkeypatch.setattr("sessions.service.session_service", service)
    monkeypatch.setattr("routes.sessions.session_service", service)
    monkeypatch.setattr("routes.generate_code.session_service", service)
    return TestClient(app)


def test_session_crud_flow(tmp_path, monkeypatch) -> None:
    client = create_test_client(tmp_path, monkeypatch)

    create_response = client.post(
        "/sessions",
        json={
            "name": "Fee Comparison",
            "stack": "html_tailwind",
            "input_mode": "image",
            "metadata": {"project": "title-portal"},
        },
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["session"]["id"]

    context_response = client.post(
        f"/sessions/{session_id}/context",
        json={
            "context_type": "project",
            "payload": {"module": "fee-comparison"},
        },
    )
    assert context_response.status_code == 201

    variant_response = client.post(
        f"/sessions/{session_id}/variants",
        json={
            "variant_index": 0,
            "model": "gpt-5.4",
            "code": "<div>Variant</div>",
            "metadata": {"stack": "html_tailwind"},
        },
    )
    assert variant_response.status_code == 201
    variant_id = variant_response.json()["id"]

    select_response = client.post(
        f"/sessions/{session_id}/select",
        json={"variant_id": variant_id},
    )
    assert select_response.status_code == 200
    assert select_response.json()["session"]["selected_variant_id"] == variant_id

    export_response = client.get(f"/sessions/{session_id}/export")
    assert export_response.status_code == 200
    export_json = export_response.json()
    assert export_json["selected_variant"]["id"] == variant_id
    assert len(export_json["variants"]) == 1

    list_response = client.get("/sessions", params={"status_filter": "completed"})
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
