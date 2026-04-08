"""
Databricks implementation of CatalogProvider, QueryExecutor, UploadProvider.

Uses the official databricks-sdk Python package.
Auth: Personal Access Token (P0). V2 can swap to OAuth by changing WorkspaceClient init.

P0 identifier constraint: catalog/schema/table names must NOT contain embedded dots.
  Validated at connection-create time and at drag-drop in the UI.
"""
from __future__ import annotations

import io
import logging
import re
import time
import uuid

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState, Disposition, Format

from .base import (
    CatalogInfo, CatalogProvider, ColumnInfo, MaterializeResult,
    PreviewResult, QueryExecutor, SchemaInfo, TableInfo, UploadProvider,
    UploadResult,
)

logger = logging.getLogger(__name__)

# Statement Execution: maximum poll duration
_MAX_POLL_SECONDS = 50
_POLL_INTERVAL = 2  # seconds between polls

# Inline result size cap (Databricks rejects inline results > 25 MiB)
_BYTE_LIMIT = 20_000_000


def _state_str(state) -> str:
    """Normalize a SDK enum or raw string state to a plain uppercase string."""
    if state is None:
        return ""
    return state.value if hasattr(state, "value") else str(state)


def _sanitize_table_name(filename: str) -> str:
    """Convert a filename to a safe Databricks table name (no dots, alphanumeric + _)."""
    # Remove extension
    stem = re.sub(r'\.[^.]+$', '', filename)
    # Lowercase, replace non-alphanumeric chars with _
    name = re.sub(r'[^a-z0-9_]', '_', stem.lower())
    # Must start with a letter or underscore
    if name and name[0].isdigit():
        name = f"_{name}"
    # Truncate to 63 chars (Databricks limit)
    return name[:63] or "upload"


def _map_type(type_text: str) -> str:
    """Map Databricks type string → frontend ColumnType enum value."""
    t = (type_text or "").upper().split("(")[0].strip()
    mapping = {
        "STRING": "VARCHAR", "VARCHAR": "VARCHAR", "CHAR": "VARCHAR",
        "INT": "INTEGER", "INTEGER": "INTEGER", "BIGINT": "INTEGER",
        "SMALLINT": "INTEGER", "TINYINT": "INTEGER", "BYTE": "INTEGER",
        "SHORT": "INTEGER", "LONG": "INTEGER",
        "FLOAT": "FLOAT", "DOUBLE": "FLOAT", "DECIMAL": "FLOAT", "NUMERIC": "FLOAT",
        "BOOLEAN": "BOOLEAN", "BOOL": "BOOLEAN",
        "DATE": "DATE",
        "TIMESTAMP": "TIMESTAMP", "TIMESTAMP_NTZ": "TIMESTAMP",
        "ARRAY": "ARRAY",
        "MAP": "OBJECT", "STRUCT": "OBJECT",
        "BINARY": "VARCHAR",
        "INTERVAL": "VARCHAR",
        "VOID": "UNKNOWN",
    }
    return mapping.get(t, "UNKNOWN")


class DatabricksConnector(CatalogProvider, QueryExecutor, UploadProvider):
    """
    Single connector object used per-request.
    Created by factory.py from a decrypted Connection record.
    """

    def __init__(self, host: str, token: str, warehouse_id: str = "") -> None:
        self.client = WorkspaceClient(host=host, token=token)
        self.warehouse_id = warehouse_id

    # ── CatalogProvider ───────────────────────────────────────────────────────

    def list_catalogs(self) -> list[CatalogInfo]:
        return [CatalogInfo(name=c.name) for c in self.client.catalogs.list() if c.name]

    def list_schemas(self, catalog: str) -> list[SchemaInfo]:
        return [
            SchemaInfo(name=s.name, catalog=catalog)
            for s in self.client.schemas.list(catalog_name=catalog)
            if s.name
        ]

    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]:
        return [
            TableInfo(
                name=t.name,
                catalog=catalog,
                schema=schema,
                table_type=(t.table_type.value if t.table_type else "TABLE"),
            )
            for t in self.client.tables.list(
                catalog_name=catalog,
                schema_name=schema,
                omit_columns=True,  # lazy — columns only fetched on explicit request
            )
            if t.name
        ]

    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]:
        full_name = f"{catalog}.{schema}.{table}"
        tbl = self.client.tables.get(full_name)
        return [
            ColumnInfo(
                name=c.name,
                type_text=_map_type(c.type_text or ""),
                nullable=(c.nullable if c.nullable is not None else True),
            )
            for c in (tbl.columns or [])
        ]

    # ── QueryExecutor ─────────────────────────────────────────────────────────

    def execute_preview(self, sql: str, limit: int = 100) -> PreviewResult:
        wrapped = f"SELECT * FROM (\n{sql}\n) __q LIMIT {limit}"
        return self._run_statement(wrapped, is_preview=True)

    def execute_materialize(self, sql: str) -> MaterializeResult:
        return self._run_materialize(sql)

    def _run_statement(self, sql: str, is_preview: bool) -> PreviewResult:
        """Execute SQL on the warehouse, poll until done, return structured result."""
        start = time.monotonic()

        logger.debug("Executing statement on warehouse %s:\n%s", self.warehouse_id, sql[:500])
        resp = self.client.statement_execution.execute_statement(
            warehouse_id=self.warehouse_id,
            statement=sql,
            wait_timeout=f"{_MAX_POLL_SECONDS}s",
            disposition=Disposition.INLINE,
            format=Format.JSON_ARRAY,
            byte_limit=_BYTE_LIMIT,
        )

        # Poll if still running (handle both enum and string state values)
        while resp.status and _state_str(resp.status.state) in ("PENDING", "RUNNING"):
            elapsed = time.monotonic() - start
            if elapsed > _MAX_POLL_SECONDS:
                raise TimeoutError(f"Query timed out after {_MAX_POLL_SECONDS}s on Databricks")
            time.sleep(_POLL_INTERVAL)
            resp = self.client.statement_execution.get_statement(resp.statement_id)

        final_state = _state_str(resp.status.state) if resp.status else "UNKNOWN"
        logger.debug("Statement finished with state: %s (%.0f ms)", final_state, (time.monotonic() - start) * 1000)

        if final_state == "FAILED":
            err = resp.status.error if resp.status else None
            msg = err.message if err else "Unknown Databricks error"
            raise RuntimeError(f"Databricks SQL error: {msg}")

        elapsed_ms = (time.monotonic() - start) * 1000

        # Parse result
        manifest = resp.manifest
        result = resp.result
        cols: list[ColumnInfo] = []
        if manifest and manifest.schema and manifest.schema.columns:
            cols = [
                ColumnInfo(name=c.name or "", type_text=_map_type(c.type_text or ""))
                for c in manifest.schema.columns
            ]

        rows: list[list] = []
        truncated = False
        if result:
            rows = result.data_array or []
            truncated = bool(getattr(result, "truncated", False))

        return PreviewResult(
            columns=cols,
            rows=rows,
            row_count=len(rows),
            execution_ms=elapsed_ms,
            truncated=truncated,
        )

    def _run_materialize(self, sql: str) -> MaterializeResult:
        """Execute a DDL/DML statement (CREATE TABLE AS SELECT) on the warehouse."""
        start = time.monotonic()
        logger.debug("Materializing on warehouse %s:\n%s", self.warehouse_id, sql[:500])

        resp = self.client.statement_execution.execute_statement(
            warehouse_id=self.warehouse_id,
            statement=sql,
            wait_timeout=f"{_MAX_POLL_SECONDS}s",
            disposition=Disposition.INLINE,
            format=Format.JSON_ARRAY,
        )

        while resp.status and _state_str(resp.status.state) in ("PENDING", "RUNNING"):
            if time.monotonic() - start > _MAX_POLL_SECONDS:
                raise TimeoutError("Materialization timed out on Databricks")
            time.sleep(_POLL_INTERVAL)
            resp = self.client.statement_execution.get_statement(resp.statement_id)

        elapsed_ms = (time.monotonic() - start) * 1000
        status = _state_str(resp.status.state) if resp.status else "UNKNOWN"
        logger.info("Materialization finished: state=%s (%.0f ms)", status, elapsed_ms)

        if status == "FAILED":
            err = resp.status.error if resp.status else None
            msg = err.message if err else "Unknown error"
            raise RuntimeError(f"Databricks materialization failed: {msg}")

        return MaterializeResult(
            execution_ms=elapsed_ms,
            statement_id=resp.statement_id or "",
            target_table="",  # set by caller
            status="SUCCEEDED",
        )

    # ── UploadProvider ────────────────────────────────────────────────────────

    def upload_csv(
        self,
        file_bytes: bytes,
        filename: str,
        upload_catalog: str,
        upload_schema: str,
        upload_volume: str,
    ) -> UploadResult:
        """
        Upload a CSV file to a Unity Catalog Volume, then load it into a Delta table.

        Uses CREATE OR REPLACE TABLE ... AS SELECT * FROM read_files() which:
        - Infers schema automatically from the CSV content
        - Creates the table (no pre-existing table required)
        - Loads the data in one step

        A UUID prefix ensures unique volume paths — COPY INTO idempotency cannot
        accidentally skip a re-uploaded file.
        """
        table_name = _sanitize_table_name(filename)
        unique_prefix = uuid.uuid4().hex[:8]
        volume_path = (
            f"/Volumes/{upload_catalog}/{upload_schema}/{upload_volume}/"
            f"{unique_prefix}_{table_name}.csv"
        )

        logger.info("Uploading CSV to Databricks Volume: %s", volume_path)
        self.client.files.upload(volume_path, io.BytesIO(file_bytes), overwrite=True)

        # Build fully-qualified backtick-quoted target table name
        fqt = f"`{upload_catalog}`.`{upload_schema}`.`{table_name}`"

        create_sql = (
            f"CREATE OR REPLACE TABLE {fqt}\n"
            f"AS SELECT * FROM read_files(\n"
            f"  '{volume_path}',\n"
            f"  format => 'csv',\n"
            f"  header => 'true'\n"
            f")"
        )

        logger.info("Creating Delta table: %s", fqt)
        self._run_materialize(create_sql)

        # Fetch row count via a quick COUNT(*) query
        count_result = self._run_statement(
            f"SELECT COUNT(*) AS n FROM {fqt}", is_preview=True
        )
        row_count = int(count_result.rows[0][0]) if count_result.rows else 0

        # Fetch columns (lazy-style from catalog API)
        cols = self.list_columns(upload_catalog, upload_schema, table_name)

        return UploadResult(
            table_ref=f"{upload_catalog}.{upload_schema}.{table_name}",
            row_count=row_count,
            columns=cols,
        )

    # ── Warehouse discovery ───────────────────────────────────────────────────

    def list_warehouses(self) -> list[dict]:
        """Return available SQL warehouses the token has access to."""
        results = []
        for w in self.client.warehouses.list():
            results.append({
                "id": w.id or "",
                "name": w.name or "",
                "state": w.state.value if w.state else "UNKNOWN",
                "cluster_size": w.cluster_size or "",
            })
        return results

    # ── Warehouse lifecycle ───────────────────────────────────────────────────

    def start_warehouse(self) -> None:
        """Signal Databricks to start the warehouse. Non-blocking."""
        logger.info("Starting warehouse %s", self.warehouse_id)
        try:
            self.client.warehouses.start(self.warehouse_id)
        except Exception as exc:
            # Warehouse may already be running — not an error
            logger.debug("Warehouse start signal: %s", exc)

    def stop_warehouse(self) -> None:
        """Signal Databricks to stop the warehouse. Non-blocking."""
        logger.info("Stopping warehouse %s", self.warehouse_id)
        try:
            self.client.warehouses.stop(self.warehouse_id)
        except Exception as exc:
            logger.debug("Warehouse stop signal: %s", exc)

    def get_warehouse_status(self) -> str:
        """Return current warehouse state string: RUNNING, STOPPED, STARTING, etc."""
        try:
            w = self.client.warehouses.get(self.warehouse_id)
            return _state_str(w.state)
        except Exception as exc:
            logger.warning("Failed to get warehouse status: %s", exc)
            return "UNKNOWN"

    # ── Convenience: test connection ──────────────────────────────────────────

    def ping(self) -> bool:
        """Run SELECT 1 to verify credentials and warehouse are reachable."""
        try:
            result = self._run_statement("SELECT 1 AS ok", is_preview=True)
            return bool(result.rows)
        except Exception:
            return False
