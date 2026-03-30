import time
from typing import Any

import duckdb

from app.db.connection import get_connection, reconnect
from app.models.schemas import (
    ColumnInfo,
    DatabaseInfo,
    SchemaInfo,
    TableInfo,
    PreviewResult,
    PreviewColumnInfo,
    CSVUploadResult,
)


def connect_db(path: str | None = None) -> dict:
    conn = reconnect(path or ":memory:")
    version = conn.execute("SELECT version()").fetchone()[0]
    return {"status": "connected", "duckdb_version": version, "path": path or ":memory:"}


def get_database_tree() -> list[DatabaseInfo]:
    conn = get_connection()
    raw = conn.execute("""
        SELECT table_catalog, table_schema, table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        ORDER BY table_catalog, table_schema, table_name, ordinal_position
    """).fetchall()

    tree: dict[str, dict[str, dict[str, list]]] = {}
    for catalog, schema, table, col, dtype, nullable in raw:
        tree.setdefault(catalog, {}).setdefault(schema, {}).setdefault(table, []).append(
            ColumnInfo(name=col, type=dtype, nullable=(nullable == "YES"))
        )

    result = []
    for cat_name, schemas in tree.items():
        schema_list = []
        for schema_name, tables in schemas.items():
            if schema_name in ("information_schema", "pg_catalog"):
                continue
            table_list = [
                TableInfo(name=tbl, columns=cols)
                for tbl, cols in tables.items()
            ]
            if table_list:
                schema_list.append(SchemaInfo(name=schema_name, tables=table_list))
        if schema_list:
            result.append(DatabaseInfo(name=cat_name, schemas=schema_list))
    return result


def _map_duckdb_type(dtype: str) -> str:
    """Map DuckDB type name to our frontend ColumnType enum."""
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


def preview_sql(sql: str, limit: int = 100) -> PreviewResult:
    conn = get_connection()
    start = time.perf_counter()

    # Get column names + types via DESCRIBE before running
    try:
        desc_rows = conn.execute(
            f"DESCRIBE SELECT * FROM ({sql}) __q"
        ).fetchall()
        col_info = [
            PreviewColumnInfo(name=r[0], type=_map_duckdb_type(r[1]))
            for r in desc_rows
        ]
    except Exception:
        col_info = []  # fallback — filled from rel.description below

    # Execute with row limit
    wrapped = f"SELECT * FROM ({sql}) __q LIMIT {limit}"
    rel = conn.execute(wrapped)
    rows = rel.fetchall()

    # Fallback: if DESCRIBE failed, build col_info from result description
    if not col_info:
        col_info = [PreviewColumnInfo(name=desc[0], type="UNKNOWN") for desc in rel.description]

    elapsed_ms = (time.perf_counter() - start) * 1000
    serialized = [[_serialize(v) for v in row] for row in rows]

    return PreviewResult(
        columns=col_info,
        rows=serialized,
        row_count=len(rows),
        execution_time_ms=round(elapsed_ms, 2),
        is_sampled=len(rows) == limit,
    )


def _serialize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def upload_csv(file_bytes: bytes, filename: str) -> CSVUploadResult:
    import tempfile, os

    table_name = os.path.splitext(filename)[0].replace("-", "_").replace(" ", "_").lower()

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        return _do_upload_csv(tmp_path, table_name)
    except duckdb.TransactionException:
        # Another process (e.g. VS Code DuckDB extension) holds the write lock.
        # Reconnect to clear any stale transaction state and retry once.
        try:
            reconnect()
            return _do_upload_csv(tmp_path, table_name)
        except duckdb.TransactionException as exc:
            raise RuntimeError(
                "DuckDB write lock conflict: another process is holding an exclusive "
                "lock on the database file. If you have a VS Code DuckDB extension "
                "connected to this file, please disconnect it or set it to read-only "
                "mode and retry."
            ) from exc
    finally:
        os.unlink(tmp_path)


def _do_upload_csv(tmp_path: str, table_name: str) -> CSVUploadResult:
    conn = get_connection()
    conn.execute(f"""
        CREATE OR REPLACE TABLE "{table_name}" AS
        SELECT * FROM read_csv_auto('{tmp_path}', header=true)
    """)
    count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
    cols_raw = conn.execute(f"""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = '{table_name}'
        ORDER BY ordinal_position
    """).fetchall()
    columns = [ColumnInfo(name=r[0], type=r[1], nullable=(r[2] == "YES")) for r in cols_raw]
    return CSVUploadResult(table_name=table_name, row_count=count, columns=columns)


def generate_sql(transformation_type: str, config: dict, input_tables: list[str]) -> str:
    """Build SQL from a typed transformation config."""
    if transformation_type == "filter":
        return _build_filter_sql(input_tables[0], config)
    if transformation_type == "join":
        return _build_join_sql(input_tables, config)
    if transformation_type == "aggregate":
        return _build_aggregate_sql(input_tables[0], config)
    if transformation_type == "select":
        return _build_select_sql(input_tables[0], config)
    raise ValueError(f"Unknown transformation type: {transformation_type}")


def _build_filter_sql(table: str, config: dict) -> str:
    conditions = config.get("conditions", [])
    if not conditions:
        return f"SELECT * FROM {table}"
    parts = []
    for c in conditions:
        col, op, val = c.get("column"), c.get("operator"), c.get("value")
        if op in ("IS NULL", "IS NOT NULL"):
            parts.append(f"{col} {op}")
        elif op in ("IN", "NOT IN"):
            parts.append(f"{col} {op} ({val})")
        else:
            parts.append(f"{col} {op} '{val}'")
    logic = config.get("logic", "AND")
    where = f" {logic} ".join(parts)
    return f"SELECT * FROM {table}\nWHERE {where}"


def _build_join_sql(tables: list[str], config: dict) -> str:
    left, right = tables[0], tables[1] if len(tables) > 1 else tables[0]
    join_type = config.get("joinType", "INNER").upper()
    conditions = config.get("conditions", [])
    on_parts = [f"{c['leftColumn']} = {c['rightColumn']}" for c in conditions]
    on_clause = " AND ".join(on_parts) if on_parts else "TRUE"
    return f"SELECT *\nFROM {left}\n{join_type} JOIN {right} ON {on_clause}"


def _build_aggregate_sql(table: str, config: dict) -> str:
    group_by = config.get("groupBy", [])
    measures = config.get("measures", [])
    select_parts = list(group_by)
    for m in measures:
        alias = m.get("alias") or f"{m['function'].lower()}_{m['column']}"
        select_parts.append(f"{m['function']}({m['column']}) AS {alias}")
    cols = ", ".join(select_parts) if select_parts else "*"
    sql = f"SELECT {cols}\nFROM {table}"
    if group_by:
        sql += f"\nGROUP BY {', '.join(group_by)}"
    return sql


def _build_select_sql(table: str, config: dict) -> str:
    columns = config.get("columns", [])
    renames = config.get("renames", {})
    if not columns:
        return f"SELECT * FROM {table}"
    parts = []
    for col in columns:
        alias = renames.get(col)
        parts.append(f"{col} AS {alias}" if alias else col)
    return f"SELECT {', '.join(parts)}\nFROM {table}"
