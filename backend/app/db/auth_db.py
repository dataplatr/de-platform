"""
SQLite-backed store for users, sessions, pipelines, connections, and audit logs.
All data here is platform metadata — no customer analytics data is stored locally.
"""
import sqlite3
import threading
from pathlib import Path

from app.config import settings  # used for ENV check in init_auth_db

_local = threading.local()


def get_auth_conn() -> sqlite3.Connection:
    """Per-thread SQLite connection — each thread owns its own connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        db_path = Path(settings.AUTH_DB_PATH)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # Each thread gets its own connection via threading.local(), so
        # check_same_thread is not needed and we leave it at the safe default.
        _local.conn = sqlite3.connect(str(db_path), timeout=30)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA busy_timeout=30000")   # 30s retry on lock
        _local.conn.execute("PRAGMA synchronous=NORMAL")   # safe with WAL, faster
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

        -- Databricks (and future) connector credentials.
        -- token_enc is a Fernet-encrypted PAT — never stored in plaintext.
        -- alias is immutable after creation (unique per user) and is what pipeline
        -- source nodes reference for portability across credential rotations.
        -- P0 constraint: catalog/schema/table names with embedded dots are not supported.
        CREATE TABLE IF NOT EXISTS connections (
            id              TEXT    PRIMARY KEY,
            user_id         INTEGER NOT NULL,
            alias           TEXT    NOT NULL,
            name            TEXT    NOT NULL,
            connector_type  TEXT    NOT NULL DEFAULT 'databricks',
            host            TEXT    NOT NULL,
            token_enc       TEXT    NOT NULL,
            warehouse_id    TEXT    NOT NULL,
            default_catalog TEXT,
            default_schema  TEXT,
            upload_catalog  TEXT    NOT NULL,
            upload_schema   TEXT    NOT NULL,
            upload_volume   TEXT    NOT NULL,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            is_active       INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, alias)
        );
        CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
    """)

    _run_migrations(conn)

    if settings.ENV == "development":
        _seed_users(conn)


def _run_migrations(conn: sqlite3.Connection) -> None:
    """Add new columns and tables to existing schema. Safe to run on every startup."""
    # Column additions (fail silently if already exists)
    col_migrations = [
        "ALTER TABLE connections ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'pat'",
        "ALTER TABLE connections ADD COLUMN refresh_token_enc TEXT",
        "ALTER TABLE connections ADD COLUMN token_expires_at TEXT",
        "ALTER TABLE connections ADD COLUMN oauth_client_id TEXT",
    ]
    for sql in col_migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # Column already exists — ignore

    # New tables for schema metadata caching
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS selected_schemas (
            id            TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL REFERENCES connections(id),
            catalog       TEXT NOT NULL,
            schema        TEXT NOT NULL,
            synced_at     TEXT,
            UNIQUE(connection_id, catalog, schema)
        );

        CREATE TABLE IF NOT EXISTS table_metadata_cache (
            id            TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL REFERENCES connections(id),
            catalog       TEXT NOT NULL,
            schema        TEXT NOT NULL,
            table_name    TEXT NOT NULL,
            table_type    TEXT NOT NULL DEFAULT 'TABLE',
            columns_json  TEXT NOT NULL DEFAULT '[]',
            row_count     INTEGER,
            synced_at     TEXT NOT NULL,
            UNIQUE(connection_id, catalog, schema, table_name)
        );
        CREATE INDEX IF NOT EXISTS idx_tmc_connection ON table_metadata_cache(connection_id);
    """)


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


