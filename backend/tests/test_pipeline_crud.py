"""
Pipeline CRUD tests — create, read, update, delete, and 404 on missing.
"""
from fastapi.testclient import TestClient


def test_create_pipeline(client: TestClient, admin_headers: dict) -> None:
    resp = client.post(
        "/api/pipelines",
        json={"name": "Test Pipeline", "nodes": [], "edges": []},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Pipeline"
    assert "id" in data


def test_list_pipelines(client: TestClient, admin_headers: dict) -> None:
    resp = client.get("/api/pipelines", headers=admin_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_pipeline(client: TestClient, admin_headers: dict) -> None:
    # Create one first
    create_resp = client.post(
        "/api/pipelines",
        json={"name": "Get Test", "nodes": [{"id": "n1"}], "edges": []},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    pipeline_id = create_resp.json()["id"]

    # Retrieve it
    get_resp = client.get(f"/api/pipelines/{pipeline_id}", headers=admin_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == pipeline_id
    assert get_resp.json()["name"] == "Get Test"


def test_update_pipeline(client: TestClient, admin_headers: dict) -> None:
    create_resp = client.post(
        "/api/pipelines",
        json={"name": "Before Update", "nodes": [], "edges": []},
        headers=admin_headers,
    )
    pipeline_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/pipelines/{pipeline_id}",
        json={"name": "After Update", "nodes": [{"id": "n1"}, {"id": "n2"}], "edges": []},
        headers=admin_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "After Update"


def test_delete_pipeline(client: TestClient, admin_headers: dict) -> None:
    create_resp = client.post(
        "/api/pipelines",
        json={"name": "To Delete", "nodes": [], "edges": []},
        headers=admin_headers,
    )
    pipeline_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/api/pipelines/{pipeline_id}", headers=admin_headers)
    assert delete_resp.status_code == 200

    # Confirm it is gone
    get_resp = client.get(f"/api/pipelines/{pipeline_id}", headers=admin_headers)
    assert get_resp.status_code == 404


def test_get_nonexistent_pipeline_returns_404(client: TestClient, admin_headers: dict) -> None:
    resp = client.get("/api/pipelines/does-not-exist-xyz", headers=admin_headers)
    assert resp.status_code == 404


def test_pipeline_name_too_short_rejected(client: TestClient, admin_headers: dict) -> None:
    resp = client.post(
        "/api/pipelines",
        json={"name": "", "nodes": [], "edges": []},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_user_cannot_access_other_users_pipeline(client: TestClient, admin_headers: dict, analyst_headers: dict) -> None:
    # Admin creates a pipeline
    create_resp = client.post(
        "/api/pipelines",
        json={"name": "Admin Private", "nodes": [], "edges": []},
        headers=admin_headers,
    )
    pipeline_id = create_resp.json()["id"]

    # Analyst should not be able to access it
    get_resp = client.get(f"/api/pipelines/{pipeline_id}", headers=analyst_headers)
    assert get_resp.status_code == 404
