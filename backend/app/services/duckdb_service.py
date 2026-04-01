"""
Compatibility shim — delegates to the focused service modules.
New code should import directly from the specific module.
"""
from app.db.connection import get_connection, reconnect  # noqa: F401 — re-exported
from app.services.csv_service import upload_csv  # noqa: F401
from app.services.query_service import preview_sql  # noqa: F401
from app.services.schema_service import get_database_tree  # noqa: F401
from app.services.sql_builder import generate_sql  # noqa: F401


def connect_db(path: str | None = None) -> dict:
    conn = reconnect(path or ":memory:")
    version = conn.execute("SELECT version()").fetchone()[0]
    return {"status": "connected", "duckdb_version": version, "path": path or ":memory:"}
