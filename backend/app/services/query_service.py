"""
Query execution service — wraps QueryExecutor for use by routes.
Maps connector PreviewResult to the schema expected by the frontend.

Type mapping is handled in the connector layer (DatabricksConnector._map_type).
Here we only convert the final PreviewResult DTO to a JSON-serializable dict.
"""
from __future__ import annotations

from app.connectors.base import QueryExecutor, MaterializeResult


def preview(executor: QueryExecutor, sql: str, limit: int = 100) -> dict:
    """
    Run a preview query (SELECT * FROM (...) LIMIT n) and return structured result.

    Returns the dict shape expected by the frontend PreviewResult interface:
      { columns, rows, row_count, execution_time_ms, is_sampled }
    """
    result = executor.execute_preview(sql, limit)
    return {
        "columns": [{"name": c.name, "type": c.type_text} for c in result.columns],
        "rows": result.rows,
        "row_count": result.row_count,
        "execution_time_ms": result.execution_ms,
        "is_sampled": result.truncated,
    }


def materialize(executor: QueryExecutor, create_sql: str, target_table: str) -> dict:
    """
    Execute a CREATE OR REPLACE TABLE ... AS SELECT ... statement.

    Does NOT promise an accurate row_count from the CTAS metadata alone.
    row_count is omitted — the plan documents this as intentional for P0.
    Callers can run a separate COUNT(*) if needed.

    Returns: { execution_ms, statement_id, target_table, status }
    """
    result: MaterializeResult = executor.execute_materialize(create_sql)
    result.target_table = target_table
    return {
        "execution_ms": result.execution_ms,
        "statement_id": result.statement_id,
        "target_table": result.target_table,
        "status": result.status,
    }
