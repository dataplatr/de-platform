import os
import duckdb
from pathlib import Path

from app.config import settings

_conn: duckdb.DuckDBPyConnection | None = None


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return the active DuckDB connection (singleton per process)."""
    global _conn
    if _conn is None:
        _conn = _create_connection(settings.DUCKDB_PATH)
    return _conn


def _create_connection(path: str) -> duckdb.DuckDBPyConnection:
    if path == ":memory:":
        conn = duckdb.connect(":memory:")
    else:
        db_path = Path(path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = duckdb.connect(str(db_path))
    _seed_demo_data(conn)
    return conn


def reconnect(path: str | None = None) -> duckdb.DuckDBPyConnection:
    """Close existing connection and open a new one at the given path."""
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
    _conn = _create_connection(path or settings.DUCKDB_PATH)
    return _conn


def _seed_demo_data(conn: duckdb.DuckDBPyConnection) -> None:
    """Seed lightweight demo tables so the UI has something to explore."""
    conn.execute("""
        CREATE SCHEMA IF NOT EXISTS demo;

        CREATE TABLE IF NOT EXISTS demo.orders (
            order_id    INTEGER,
            customer_id INTEGER,
            product     VARCHAR,
            amount      DOUBLE,
            status      VARCHAR,
            order_date  DATE
        );

        CREATE TABLE IF NOT EXISTS demo.customers (
            customer_id INTEGER,
            name        VARCHAR,
            country     VARCHAR,
            segment     VARCHAR
        );
    """)

    row_check = conn.execute("SELECT COUNT(*) FROM demo.orders").fetchone()[0]
    if row_check == 0:
        conn.execute("""
            INSERT INTO demo.orders VALUES
                (1, 101, 'Widget A', 29.99, 'shipped',   '2024-01-05'),
                (2, 102, 'Widget B', 49.99, 'pending',   '2024-01-06'),
                (3, 101, 'Gadget X', 99.99, 'delivered', '2024-01-07'),
                (4, 103, 'Widget A', 29.99, 'shipped',   '2024-01-08'),
                (5, 104, 'Gadget Y', 79.99, 'cancelled', '2024-01-09');

            INSERT INTO demo.customers VALUES
                (101, 'Alice',   'US', 'retail'),
                (102, 'Bob',     'UK', 'wholesale'),
                (103, 'Charlie', 'US', 'retail'),
                (104, 'Diana',   'CA', 'wholesale');
        """)
