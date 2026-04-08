"""
CRUD for Databricks (and future) connection credentials.

auth_type = 'pat'  → token_enc holds the encrypted PAT.
auth_type = 'oauth' → token_enc holds the encrypted OAuth access token;
                      refresh_token_enc + token_expires_at drive auto-refresh;
                      oauth_client_id is needed for refresh calls.

Tokens are encrypted at rest using Fernet symmetric encryption.
The encryption key is FERNET_KEY from settings.

P0 portability model: pipelines store connection_alias (immutable slug).
  Alias is unique per user — set at create time, never changed.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.db.auth_db import get_auth_conn


# ── Token encryption ──────────────────────────────────────────────────────────

def _fernet() -> Fernet:
    return Fernet(settings.FERNET_KEY.encode())


def encrypt_token(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception) as exc:
        raise ValueError("Failed to decrypt token — FERNET_KEY may have changed") from exc


# ── Validation ────────────────────────────────────────────────────────────────

def _validate_no_dots(value: str, field: str) -> None:
    if "." in value:
        raise ValueError(
            f"{field} must not contain dots ('{value}'). "
            "P0 constraint: use catalog/schema names without embedded dots."
        )


# ── Token resolution (PAT or OAuth with auto-refresh) ─────────────────────────

def get_valid_token(connection: dict) -> str:
    """
    Return a live access token for the connection.
    For PAT connections: simply decrypt and return.
    For OAuth connections: refresh if the token is within 60 s of expiry.
    """
    auth_type = connection.get("auth_type", "pat")

    if auth_type == "pat":
        return decrypt_token(connection["token_enc"])

    # OAuth — check expiry
    expires_at_str = connection.get("token_expires_at")
    if expires_at_str:
        expires_at = datetime.fromisoformat(expires_at_str)
        if datetime.now(timezone.utc) >= expires_at - timedelta(seconds=60):
            return _refresh_and_store(connection)

    return decrypt_token(connection["token_enc"])


def _refresh_and_store(connection: dict) -> str:
    """Refresh the OAuth access token and persist the new tokens to the DB."""
    from app.services import oauth_service

    workspace_url = connection["host"]
    client_id = connection["oauth_client_id"]
    refresh_tok = decrypt_token(connection["refresh_token_enc"])

    token_data = oauth_service.refresh_access_token(workspace_url, client_id, refresh_tok)

    new_access = token_data["access_token"]
    new_refresh = token_data.get("refresh_token", refresh_tok)  # some providers rotate
    expires_in = int(token_data.get("expires_in", 3600))
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

    db = get_auth_conn()
    db.execute(
        """UPDATE connections
           SET token_enc=?, refresh_token_enc=?, token_expires_at=?, updated_at=datetime('now')
           WHERE id=?""",
        (encrypt_token(new_access), encrypt_token(new_refresh), expires_at, connection["id"]),
    )
    db.commit()

    return new_access


# ── CRUD ──────────────────────────────────────────────────────────────────────

def create_connection(user_id: int, data: dict) -> dict:
    """Create a PAT-based connection record."""
    alias          = (data.get("alias") or "").strip()
    name           = (data.get("name") or alias or "My Databricks").strip()
    host           = (data.get("host") or "").rstrip("/")
    token          = (data.get("token") or "").strip()
    warehouse_id   = (data.get("warehouse_id") or "").strip()
    upload_catalog = (data.get("upload_catalog") or "").strip()
    upload_schema  = (data.get("upload_schema") or "").strip()
    upload_volume  = (data.get("upload_volume") or "").strip()

    if not alias:        raise ValueError("alias is required")
    if not host:         raise ValueError("host is required")
    if not token:        raise ValueError("token is required")
    if not warehouse_id: raise ValueError("warehouse_id is required")

    for val, label in [
        (upload_catalog, "upload_catalog"),
        (upload_schema,  "upload_schema"),
        (upload_volume,  "upload_volume"),
    ]:
        _validate_no_dots(val, label)

    return _insert_connection(
        user_id=user_id,
        alias=alias, name=name, host=host,
        connector_type=data.get("connector_type", "databricks"),
        token_enc=encrypt_token(token),
        warehouse_id=warehouse_id,
        default_catalog=data.get("default_catalog") or None,
        default_schema=data.get("default_schema") or None,
        upload_catalog=upload_catalog,
        upload_schema=upload_schema,
        upload_volume=upload_volume,
        auth_type="pat",
    )


def create_oauth_connection(
    user_id: int,
    alias: str,
    name: str,
    host: str,
    client_id: str,
    access_token: str,
    refresh_token: str,
    expires_in: int,
) -> dict:
    """
    Create a connection record from a completed OAuth flow.
    warehouse_id and upload_* are empty — set via update_connection() after the user
    selects a warehouse in the next wizard step.
    """
    alias = alias.strip()
    name  = name.strip() or alias
    host  = host.rstrip("/")

    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    ).isoformat()

    return _insert_connection(
        user_id=user_id,
        alias=alias, name=name, host=host,
        connector_type="databricks",
        token_enc=encrypt_token(access_token),
        warehouse_id="",
        default_catalog=None, default_schema=None,
        upload_catalog="", upload_schema="", upload_volume="",
        auth_type="oauth",
        refresh_token_enc=encrypt_token(refresh_token),
        token_expires_at=expires_at,
        oauth_client_id=client_id,
    )


def update_connection(connection_id: str, user_id: int, data: dict) -> dict:
    """
    Partial update: warehouse_id, upload_catalog/schema/volume, name.
    alias and auth fields are immutable.
    """
    conn_record = get_connection(connection_id, user_id)

    warehouse_id   = data.get("warehouse_id",   conn_record.get("warehouse_id",   ""))
    upload_catalog = data.get("upload_catalog", conn_record.get("upload_catalog", ""))
    upload_schema  = data.get("upload_schema",  conn_record.get("upload_schema",  ""))
    upload_volume  = data.get("upload_volume",  conn_record.get("upload_volume",  ""))
    name           = data.get("name",           conn_record.get("name",           ""))

    for val, label in [
        (upload_catalog, "upload_catalog"),
        (upload_schema,  "upload_schema"),
        (upload_volume,  "upload_volume"),
    ]:
        if val:
            _validate_no_dots(val, label)

    db = get_auth_conn()
    db.execute(
        """UPDATE connections
           SET warehouse_id=?, upload_catalog=?, upload_schema=?, upload_volume=?,
               name=?, updated_at=datetime('now')
           WHERE id=? AND user_id=?""",
        (warehouse_id, upload_catalog, upload_schema, upload_volume,
         name, connection_id, user_id),
    )
    db.commit()
    return get_connection(connection_id, user_id)


def _insert_connection(
    user_id: int, alias: str, name: str, host: str,
    connector_type: str, token_enc: str, warehouse_id: str,
    default_catalog: str | None, default_schema: str | None,
    upload_catalog: str, upload_schema: str, upload_volume: str,
    auth_type: str = "pat",
    refresh_token_enc: str | None = None,
    token_expires_at: str | None = None,
    oauth_client_id: str | None = None,
) -> dict:
    conn_id = str(uuid.uuid4())
    db = get_auth_conn()
    try:
        db.execute(
            """INSERT INTO connections
               (id, user_id, alias, name, connector_type, host, token_enc,
                warehouse_id, default_catalog, default_schema,
                upload_catalog, upload_schema, upload_volume,
                auth_type, refresh_token_enc, token_expires_at, oauth_client_id,
                created_at, updated_at, is_active)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),1)""",
            (
                conn_id, user_id, alias, name, connector_type, host, token_enc,
                warehouse_id, default_catalog, default_schema,
                upload_catalog, upload_schema, upload_volume,
                auth_type, refresh_token_enc, token_expires_at, oauth_client_id,
            ),
        )
        db.commit()
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise ValueError(f"Alias '{alias}' is already in use. Choose a different alias.") from exc
        raise

    return get_connection(conn_id, user_id)


def get_connection(connection_id: str, user_id: int) -> dict:
    db = get_auth_conn()
    row = db.execute(
        "SELECT * FROM connections WHERE id=? AND user_id=? AND is_active=1",
        (connection_id, user_id),
    ).fetchone()
    if row is None:
        raise ValueError(f"Connection {connection_id!r} not found")
    return dict(row)


def get_connection_by_alias(alias: str, user_id: int) -> dict:
    db = get_auth_conn()
    row = db.execute(
        "SELECT * FROM connections WHERE alias=? AND user_id=? AND is_active=1",
        (alias, user_id),
    ).fetchone()
    if row is None:
        raise ValueError(f"No active connection with alias '{alias}'.")
    return dict(row)


def list_connections(user_id: int) -> list[dict]:
    db = get_auth_conn()
    rows = db.execute(
        """SELECT id, user_id, alias, name, connector_type, host, warehouse_id,
                  default_catalog, default_schema,
                  upload_catalog, upload_schema, upload_volume,
                  auth_type, oauth_client_id,
                  created_at, updated_at
           FROM connections
           WHERE user_id=? AND is_active=1
           ORDER BY created_at ASC""",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def delete_connection(connection_id: str, user_id: int) -> None:
    db = get_auth_conn()
    result = db.execute(
        "UPDATE connections SET is_active=0, updated_at=datetime('now') WHERE id=? AND user_id=?",
        (connection_id, user_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise ValueError(f"Connection {connection_id!r} not found")


def test_connection_credentials(host: str, token: str, warehouse_id: str) -> tuple[bool, str]:
    """Validate Databricks credentials by running SELECT 1."""
    from app.connectors.databricks_connector import DatabricksConnector
    try:
        connector = DatabricksConnector(host=host, token=token, warehouse_id=warehouse_id)
        ok = connector.ping()
        if ok:
            return True, ""
        return False, "Connection test failed — warehouse returned no result"
    except Exception as exc:
        return False, str(exc)
