"""
Test configuration — env vars must be set BEFORE any app module is imported
so pydantic-settings picks them up at Settings() instantiation time.
"""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="lakeflow_test_")
os.environ.setdefault("DUCKDB_PATH", ":memory:")
os.environ.setdefault("AUTH_DB_PATH", f"{_tmp}/test_auth.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-purposes-32c")
os.environ.setdefault("ENV", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def admin_token(client: TestClient) -> str:
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def analyst_token(client: TestClient) -> str:
    resp = client.post("/api/auth/login", json={"username": "analyst", "password": "analyst"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def analyst_headers(analyst_token: str) -> dict:
    return {"Authorization": f"Bearer {analyst_token}"}
