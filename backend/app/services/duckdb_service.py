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


def preview_sql(sql: str, limit: int = 100) -> PreviewResult:
    conn = get_connection()
    start = time.perf_counter()

    # Wrap the user's SQL in a limit subquery
    wrapped = f"SELECT * FROM ({sql}) __q LIMIT {limit}"
    rel = conn.execute(wrapped)
    rows = rel.fetchall()
    columns = [desc[0] for desc in rel.description]

    elapsed_ms = (time.perf_counter() - start) * 1000
    serialized = [[_serialize(v) for v in row] for row in rows]

    return PreviewResult(
        columns=columns,
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

    conn = get_connection()
    table_name = os.path.splitext(filename)[0].replace("-", "_").replace(" ", "_").lower()

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
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
    finally:
        os.unlink(tmp_path)

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
