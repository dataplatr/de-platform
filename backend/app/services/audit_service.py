from typing import Optional
from app.db.auth_db import get_auth_conn


def log_activity(
    action: str,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    status_code: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[str] = None,
) -> None:
    conn = get_auth_conn()
    conn.execute(
        """INSERT INTO audit_log
           (user_id, username, action, method, path, status_code, ip_address, user_agent, details)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (user_id, username, action, method, path, status_code, ip_address, user_agent, details),
    )
    conn.commit()


def get_audit_log(limit: int = 200, offset: int = 0) -> list[dict]:
    rows = get_auth_conn().execute(
        """SELECT * FROM audit_log
           ORDER BY timestamp DESC
           LIMIT ? OFFSET ?""",
        (limit, offset),
    ).fetchall()
    return [dict(r) for r in rows]


def get_user_activity(user_id: int, limit: int = 100) -> list[dict]:
    rows = get_auth_conn().execute(
        """SELECT * FROM audit_log
           WHERE user_id = ?
           ORDER BY timestamp DESC
           LIMIT ?""",
        (user_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]
