"""
SQLite-backed store for users, sessions, and audit logs.
Kept separate from DuckDB (analytics) intentionally — SQLite is OLTP-friendly.
"""
import sqlite3
import threading
from pathlib import Path

from app.config import settings

_local = threading.local()


def get_auth_conn() -> sqlite3.Connection:
    """Thread-local SQLite connection (FastAPI can use multiple threads)."""
    if not hasattr(_local, "conn") or _local.conn is None:
        db_path = Path(settings.AUTH_DB_PATH)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _local.conn = sqlite3.connect(str(db_path), check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
    return _local.conn


def init_auth_db() -> None:
    """Create tables and seed the default admin user."""
    conn = get_auth_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    UNIQUE NOT NULL,
            email         TEXT,
            hashed_password TEXT  NOT NULL,
            role          TEXT    NOT NULL DEFAULT 'analyst',
            is_active     INTEGER NOT NULL DEFAULT 1,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL,
            jti        TEXT    UNIQUE NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT    NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT    NOT NULL,
            is_revoked INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
            user_id     INTEGER,
            username    TEXT,
            action      TEXT    NOT NULL,
            method      TEXT,
            path        TEXT,
            status_code INTEGER,
            ip_address  TEXT,
            user_agent  TEXT,
            details     TEXT
        );

        CREATE TABLE IF NOT EXISTS pipelines (
            id         TEXT    PRIMARY KEY,
            user_id    INTEGER NOT NULL,
            name       TEXT    NOT NULL,
            nodes_json TEXT    NOT NULL DEFAULT '[]',
            edges_json TEXT    NOT NULL DEFAULT '[]',
            created_at TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_pipelines_user ON pipelines(user_id);
    """)

    # Seed default users if table is empty
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count == 0:
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
        users = [
            ("admin",   None,                  pwd.hash("admin"),   "admin"),
            ("analyst", "analyst@company.com", pwd.hash("analyst"), "analyst"),
            ("viewer",  "viewer@company.com",  pwd.hash("viewer"),  "viewer"),
        ]
        conn.executemany(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?,?,?,?)",
            users,
        )
        conn.commit()
