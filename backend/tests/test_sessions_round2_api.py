from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from sessions.service import SessionService
from sessions.store import SessionStore


FIXTURES = Path(__file__).parent / "fixtures" / "project_context"


def _client(tmp_path, monkeypatch) -> TestClient:
    store = SessionStore(tmp_path / "round2.db")
    service = SessionService(store)
    monkeypatch.setattr("sessions.service.session_service", service)
    monkeypatch.setattr("routes.sessions.session_service", service)
    monkeypatch.setattr("routes.generate_code.session_service", service)
    return TestClient(app)


def _create_session(client: TestClient) -> str:
    response = client.post(
        "/sessions",
        json={
            "name": "Round 2 Test",
            "stack": "html_tailwind",
            "input_mode": "image",
            "metadata": {},
        },
    )
    assert response.status_code == 201
    return response.json()["session"]["id"]


def test_gather_project_context_persists_project_context(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    response = client.post(
        f"/sessions/{session_id}/context/project",
        json={
            "repo_path": str(FIXTURES / "angular_signals"),
            "label": "primary-app",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["project_context"]["framework"]["name"] == "angular"
    assert body["context"]["context_type"] == "project"
    assert body["context"]["payload"]["label"] == "primary-app"

    export = client.get(f"/sessions/{session_id}/export").json()
    project_contexts = [
        record for record in export["contexts"] if record["context_type"] == "project"
    ]
    assert len(project_contexts) == 1
    assert (
        project_contexts[0]["payload"]["project_context"]["framework"]["name"]
        == "angular"
    )


def test_gather_project_context_rejects_missing_path(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    response = client.post(
        f"/sessions/{session_id}/context/project",
        json={"repo_path": str(tmp_path / "nope")},
    )
    assert response.status_code == 400


def test_extract_spec_uses_project_context_on_session(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    gather_response = client.post(
        f"/sessions/{session_id}/context/project",
        json={"repo_path": str(FIXTURES / "angular_signals")},
    )
    assert gather_response.status_code == 201

    variant_response = client.post(
        f"/sessions/{session_id}/variants",
        json={
            "variant_index": 0,
            "model": "claude-opus-4-5",
            "code": (
                "<body><section class='card'><h2 style='color:#2E7D32'>Card</h2>"
                "<ul><li>A</li><li>B</li></ul></section></body>"
            ),
            "metadata": {"stack": "html_tailwind"},
        },
    )
    assert variant_response.status_code == 201

    spec_response = client.post(
        f"/sessions/{session_id}/spec",
        json={"variant_index": 0},
    )
    assert spec_response.status_code == 200
    body = spec_response.json()
    assert body["spec"]["project_context_used"] is True
    assert any(
        suggestion["component_name"] == "CardComponent"
        for suggestion in body["spec"]["reuse_suggestions"]
    )
    markdown = body["annotated_markdown"]
    assert "app-card" in markdown
    assert "signals" in markdown.lower()
    assert body["context_record"] is not None
    assert body["context_record"]["context_type"] == "design_spec"


def test_extract_spec_without_context_uses_fallback_notes(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    client.post(
        f"/sessions/{session_id}/variants",
        json={
            "variant_index": 0,
            "model": "claude-opus-4-5",
            "code": "<body><section class='card'><h2>Hi</h2></section></body>",
        },
    )
    response = client.post(
        f"/sessions/{session_id}/spec",
        json={"variant_index": 0, "persist_as_context": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["spec"]["project_context_used"] is False
    assert body["context_record"] is None
    assert any(
        "gather_project_context" in note
        for note in body["spec"]["alignment_notes"]
    )


def test_extract_spec_missing_variant_returns_404(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    response = client.post(
        f"/sessions/{session_id}/spec",
        json={"variant_index": 7},
    )
    assert response.status_code == 404


def test_refine_variant_queues_refinement(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    client.post(
        f"/sessions/{session_id}/variants",
        json={
            "variant_index": 0,
            "model": "claude-opus-4-5",
            "code": "<body><section>Variant</section></body>",
        },
    )

    response = client.post(
        f"/sessions/{session_id}/refine",
        json={"variant_index": 0, "text": "Make the accent color pop."},
    )
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["refinement_id"]
    assert body["stream_hint"]["channel"] == "websocket"
    assert body["stream_hint"]["endpoint"] == "/generate-code"

    export = client.get(f"/sessions/{session_id}/export").json()
    queued = [
        record
        for record in export["contexts"]
        if record["context_type"] == "refinement_queue"
    ]
    assert len(queued) == 1
    assert queued[0]["payload"]["text"] == "Make the accent color pop."
    assert queued[0]["payload"]["has_image"] is False


def test_refine_variant_rejects_missing_variant(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    response = client.post(
        f"/sessions/{session_id}/refine",
        json={"variant_index": 3, "text": "nope"},
    )
    assert response.status_code == 404


def test_refine_variant_requires_text_or_image(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    session_id = _create_session(client)

    client.post(
        f"/sessions/{session_id}/variants",
        json={
            "variant_index": 0,
            "model": "claude-opus-4-5",
            "code": "<body><section>X</section></body>",
        },
    )

    response = client.post(
        f"/sessions/{session_id}/refine",
        json={"variant_index": 0},
    )
    assert response.status_code == 422
