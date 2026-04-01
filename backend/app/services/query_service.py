"""Query execution — previews SQL with a single fetch (no double-query)."""
import time
from typing import Any

from app.db.connection import get_connection
from app.models.schemas import PreviewColumnInfo, PreviewResult


def _map_duckdb_type(dtype: str) -> str:
    """Map a DuckDB type name to our frontend ColumnType enum string."""
    t = dtype.upper().split("(")[0].strip()
    if t in ("INTEGER", "INT", "INT4", "INT2", "INT1", "BIGINT", "HUGEINT",
             "SMALLINT", "TINYINT", "UBIGINT", "UINTEGER", "USMALLINT", "UTINYINT"):
        return "INTEGER"
    if t in ("DOUBLE", "FLOAT", "FLOAT4", "FLOAT8", "REAL"):
        return "FLOAT"
    if t in ("DECIMAL", "NUMERIC"):
        return "NUMBER"
    if t in ("VARCHAR", "TEXT", "STRING", "CHAR", "BPCHAR"):
        return "VARCHAR"
    if t in ("BOOLEAN", "BOOL", "LOGICAL"):
        return "BOOLEAN"
    if t == "DATE":
        return "DATE"
    if t.startswith("TIMESTAMP"):
        return "TIMESTAMP"
    if t == "JSON":
        return "OBJECT"
    if t.endswith("[]") or t.startswith("LIST") or t.startswith("ARRAY"):
        return "ARRAY"
    return "UNKNOWN"


def _serialize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def preview_sql(sql: str, limit: int = 100) -> PreviewResult:
    """Execute SQL once and derive column metadata from the result description."""
    conn = get_connection()
    start = time.perf_counter()

    # Single execution — use rel.description for column metadata (no DESCRIBE needed)
    wrapped = f"SELECT * FROM ({sql}) __q LIMIT {limit}"
    rel = conn.execute(wrapped)
    rows = rel.fetchall()

    col_info = [
        PreviewColumnInfo(name=desc[0], type=_map_duckdb_type(desc[1]))
        for desc in rel.description
    ]

    elapsed_ms = (time.perf_counter() - start) * 1000
    serialized = [[_serialize(v) for v in row] for row in rows]

    return PreviewResult(
        columns=col_info,
        rows=serialized,
        row_count=len(rows),
        execution_time_ms=round(elapsed_ms, 2),
        is_sampled=len(rows) == limit,
    )
