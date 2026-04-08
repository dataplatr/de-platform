"""
Audit logging service.

Writes are fire-and-forget: submitted to a single-threaded background executor
so they never contend with schema-cache sync writes on the same SQLite file.
"""
import logging
from concurrent.futures import ThreadPoolExecutor

from app.constants import AUDIT_MAX_LIMIT
from app.db.auth_db import get_auth_conn

logger = logging.getLogger(__name__)

# Single writer thread — SQLite only allows one concurrent writer anyway.
# This serialises all audit INSERTs and keeps them off the request thread.
_audit_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="audit-writer")


def _write_log(
    action: str,
    user_id: int | None,
    username: str | None,
    method: str | None,
    path: str | None,
    status_code: int | None,
    ip_address,
    user_agent: str | None,
    details: str | None,
) -> None:
    """Runs inside the single audit writer thread."""
    try:
        conn = get_auth_conn()
        conn.execute(
            """INSERT INTO audit_log
               (user_id, username, action, method, path, status_code, ip_address, user_agent, details)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (user_id, username, action, method, path, status_code, ip_address, user_agent, details),
        )
        conn.commit()
    except Exception:
        logger.debug("Audit write failed (non-fatal)", exc_info=True)


def log_activity(
    action: str,
    user_id: int | None = None,
    username: str | None = None,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    ip_address=None,
    user_agent: str | None = None,
    details: str | None = None,
) -> None:
    """Non-blocking: submits the write to the background audit thread."""
    _audit_executor.submit(
        _write_log, action, user_id, username, method, path,
        status_code, ip_address, user_agent, details,
    )


def get_audit_log(limit: int = 200, offset: int = 0) -> list[dict]:
    safe_limit = min(max(1, limit), AUDIT_MAX_LIMIT)
    rows = get_auth_conn().execute(
        "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        (safe_limit, offset),
    ).fetchall()
    return [dict(r) for r in rows]


def get_user_activity(user_id: int, limit: int = 100) -> list[dict]:
    safe_limit = min(max(1, limit), AUDIT_MAX_LIMIT)
    rows = get_auth_conn().execute(
        "SELECT * FROM audit_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
        (user_id, safe_limit),
    ).fetchall()
    return [dict(r) for r in rows]
