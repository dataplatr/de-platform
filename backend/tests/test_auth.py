"""
Auth tests — covers login, logout/revocation, expiry (Phase 2), inactive users
(Phase 2), and role-based access control.

Tests marked xfail are expected to fail until Phase 2 security hardening is
applied. Remove the xfail markers after Phase 2 is implemented.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


# ── Login ─────────────────────────────────────────────────────────────────────

def test_login_success(client: TestClient) -> None:
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "admin"
    assert data["username"] == "admin"


def test_login_wrong_password(client: TestClient) -> None:
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpassword"})
    assert resp.status_code == 401


def test_login_unknown_user(client: TestClient) -> None:
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "anything"})
    assert resp.status_code == 401


# ── Session revocation ────────────────────────────────────────────────────────

def test_revoked_session(client: TestClient) -> None:
    """A token used after logout must be rejected."""
    login_resp = client.post("/api/auth/login", json={"username": "viewer", "password": "viewer"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Confirm the token works
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    # Logout
    assert client.post("/api/auth/logout", headers=headers).status_code == 200

    # Token must now be rejected
    assert client.get("/api/auth/me", headers=headers).status_code == 401


# ── Session expiry (Phase 2) ──────────────────────────────────────────────────

def test_expired_session(client: TestClient) -> None:
    """A session whose expires_at is in the past must be rejected."""
    from app.db.auth_db import get_auth_conn

    login_resp = client.post("/api/auth/login", json={"username": "analyst", "password": "analyst"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Confirm it works before manipulation
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    # Set expires_at to 1 hour in the past directly in the DB
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    conn = get_auth_conn()
    conn.execute(
        "UPDATE sessions SET expires_at = ? WHERE user_id = "
        "(SELECT id FROM users WHERE username = 'analyst')",
        (past,),
    )
    conn.commit()

    # Must now be rejected by server-side expiry check
    assert client.get("/api/auth/me", headers=headers).status_code == 401


# ── Inactive user (Phase 2) ───────────────────────────────────────────────────

def test_inactive_user_rejected_mid_session(client: TestClient, admin_headers: dict) -> None:
    """Deactivating a user must invalidate their active session immediately."""
    # Create a throwaway user
    create_resp = client.post(
        "/api/users",
        json={"username": "tmp_inactive", "password": "tmppass123", "role": "viewer"},
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    user_id = create_resp.json()["id"]

    # Log in as that user
    login_resp = client.post(
        "/api/auth/login", json={"username": "tmp_inactive", "password": "tmppass123"}
    )
    assert login_resp.status_code == 200
    headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # Confirm it works
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    # Admin deactivates the user
    assert client.delete(f"/api/users/{user_id}", headers=admin_headers).status_code == 200

    # Existing session must now be rejected
    assert client.get("/api/auth/me", headers=headers).status_code == 401


# ── Role enforcement ──────────────────────────────────────────────────────────

def test_analyst_cannot_access_admin_endpoints(client: TestClient, analyst_headers: dict) -> None:
    resp = client.get("/api/users", headers=analyst_headers)
    assert resp.status_code == 403


def test_unauthenticated_request_rejected(client: TestClient) -> None:
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_admin_can_access_admin_endpoints(client: TestClient, admin_headers: dict) -> None:
    resp = client.get("/api/users", headers=admin_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
