"""
Databricks OAuth 2.0 / PKCE service.

Flow:
  1. create_auth_url()  — generates PKCE pair + state, returns the Databricks
                          /oidc/v1/authorize URL for the frontend to open.
  2. exchange_code()    — exchanges the authorization code for access + refresh tokens.
  3. refresh_access_token() — uses refresh token to get a new access token.

State is kept in a module-level dict with 10-minute TTL (acceptable for a single-process
dev server; swap to Redis for multi-process production).

Databricks OIDC endpoints (per workspace):
  Authorization: https://{host}/oidc/v1/authorize
  Token:         https://{host}/oidc/v1/token

PKCE: code_challenge_method = S256 (required by Databricks).
Scopes: "sql offline_access"
  - sql           → permission to execute SQL on warehouses
  - offline_access → gets a refresh token so sessions survive > 1 hour
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


# ── In-memory state store (TTL = 10 min) ─────────────────────────────────────

_state_store: dict[str, dict[str, Any]] = {}
_STATE_TTL_SECONDS = 600


def _store_state(key: str, value: dict[str, Any]) -> None:
    _state_store[key] = {**value, "_created_at": time.time()}


def _pop_state(key: str) -> dict[str, Any] | None:
    entry = _state_store.pop(key, None)
    if entry is None:
        return None
    if time.time() - entry["_created_at"] > _STATE_TTL_SECONDS:
        return None  # expired
    return entry


# ── PKCE helpers ──────────────────────────────────────────────────────────────

def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) — S256 method."""
    verifier_bytes = os.urandom(32)
    code_verifier = base64.urlsafe_b64encode(verifier_bytes).rstrip(b"=").decode()
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


def _random_state() -> str:
    return base64.urlsafe_b64encode(os.urandom(16)).rstrip(b"=").decode()


# ── Public API ────────────────────────────────────────────────────────────────

def create_auth_url(
    workspace_url: str,
    client_id: str,
    redirect_uri: str,
    user_id: int,
    connection_name: str,
    connection_alias: str,
) -> str:
    """
    Build the Databricks authorization URL and store the PKCE state.
    Returns the URL the frontend should open (in a popup).
    """
    workspace_url = workspace_url.rstrip("/")
    code_verifier, code_challenge = _pkce_pair()
    state = _random_state()

    _store_state(state, {
        "workspace_url": workspace_url,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "user_id": user_id,
        "connection_name": connection_name,
        "connection_alias": connection_alias,
        "code_verifier": code_verifier,
    })

    params = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "sql offline_access",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    })
    return f"{workspace_url}/oidc/v1/authorize?{params}"


def consume_state(state: str) -> dict[str, Any] | None:
    """Retrieve and remove state from the store. Returns None if expired or missing."""
    return _pop_state(state)


def exchange_code(
    workspace_url: str,
    client_id: str,
    code: str,
    code_verifier: str,
    redirect_uri: str,
) -> dict[str, Any]:
    """
    Exchange an authorization code for access + refresh tokens.
    Returns the raw token response dict: {access_token, refresh_token, expires_in, ...}
    Raises RuntimeError on failure.
    """
    return _post_token(
        f"{workspace_url.rstrip('/')}/oidc/v1/token",
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": code_verifier,
        },
    )


def refresh_access_token(
    workspace_url: str,
    client_id: str,
    refresh_token: str,
) -> dict[str, Any]:
    """
    Use a refresh token to obtain a new access token.
    Returns the token response dict.
    """
    return _post_token(
        f"{workspace_url.rstrip('/')}/oidc/v1/token",
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
        },
    )


# ── Internal ──────────────────────────────────────────────────────────────────

def _post_token(url: str, data: dict[str, str]) -> dict[str, Any]:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"Databricks token endpoint error ({exc.code}): {detail}") from exc
