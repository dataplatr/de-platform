"""
SQLite-backed store for users, sessions, pipelines, and audit logs.
Kept separate from DuckDB (analytics) intentionally — SQLite is OLTP-friendly.
"""
import json
import sqlite3
import threading
import uuid
from pathlib import Path

from app.config import settings

_local = threading.local()

_SEEDS_DIR = Path(__file__).parent / "seeds"


def get_auth_conn() -> sqlite3.Connection:
    """Per-thread SQLite connection — each thread owns its own connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        db_path = Path(settings.AUTH_DB_PATH)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # Each thread gets its own connection via threading.local(), so
        # check_same_thread is not needed and we leave it at the safe default.
        _local.conn = sqlite3.connect(str(db_path))
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
    return _local.conn


def init_auth_db() -> None:
    """Create tables and seed the default users and demo pipeline."""
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

    _seed_users(conn)
    _seed_demo_pipeline(conn)


def _seed_users(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count != 0:
        return
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


def _seed_demo_pipeline(conn: sqlite3.Connection) -> None:
    seed_exists = conn.execute("SELECT 1 FROM pipelines WHERE name='Seed Pipeline'").fetchone()
    if seed_exists:
        return

    seed_path = _SEEDS_DIR / "demo_pipeline.json"
    if not seed_path.exists():
        return

    data = json.loads(seed_path.read_text(encoding="utf-8"))
    admin_id = conn.execute("SELECT id FROM users WHERE username='admin'").fetchone()
    if not admin_id:
        return

    conn.execute(
        "INSERT INTO pipelines (id, user_id, name, nodes_json, edges_json) VALUES (?,?,?,?,?)",
        (
            str(uuid.uuid4()),
            admin_id[0],
            data["name"],
            json.dumps(data["nodes"]),
            json.dumps(data["edges"]),
        ),
    )
    conn.commit()
