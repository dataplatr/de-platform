from typing import Optional
from passlib.context import CryptContext

from app.db.auth_db import get_auth_conn

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_user_by_username(username: str) -> Optional[dict]:
    row = get_auth_conn().execute(
        "SELECT * FROM users WHERE username = ? AND is_active = 1", (username,)
    ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[dict]:
    row = get_auth_conn().execute(
        "SELECT id, username, email, role, is_active, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_user(username: str, email: Optional[str], password: str, role: str = "analyst") -> dict:
    conn = get_auth_conn()
    conn.execute(
        "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,?)",
        (username, email, hash_password(password), role),
    )
    conn.commit()
    return get_user_by_username(username)


def list_users() -> list[dict]:
    rows = get_auth_conn().execute(
        "SELECT id, username, email, role, is_active, created_at FROM users ORDER BY id"
    ).fetchall()
    return [dict(r) for r in rows]


def deactivate_user(user_id: int) -> None:
    conn = get_auth_conn()
    conn.execute(
        "UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
        (user_id,),
    )
    conn.commit()
