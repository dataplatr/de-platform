"""
Schema metadata cache service.

Stores which schemas a user has selected to browse, and caches table+column
metadata so the frontend explorer loads instantly without hitting Databricks on
every page load.

selected_schemas: which (catalog, schema) pairs the user wants in their explorer
table_metadata_cache: per-table metadata fetched eagerly from Databricks
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.db.auth_db import db_write_lock, get_auth_conn

if TYPE_CHECKING:
    from app.connectors.databricks_connector import DatabricksConnector

logger = logging.getLogger(__name__)


# ── Selected schemas ──────────────────────────────────────────────────────────


def get_selected_schemas(connection_id: str) -> list[dict]:
    db = get_auth_conn()
    rows = db.execute(
        "SELECT * FROM selected_schemas WHERE connection_id=? ORDER BY catalog, schema",
        (connection_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def add_schema(connection_id: str, catalog: str, schema: str) -> dict:
    """Add a schema to the user's selected list. Idempotent."""
    row_id = str(uuid.uuid4())
    with db_write_lock:
        db = get_auth_conn()
        try:
            db.execute(
                "INSERT INTO selected_schemas (id, connection_id, catalog, schema) VALUES (?,?,?,?)",
                (row_id, connection_id, catalog, schema),
            )
            db.commit()
        except Exception:
            db.rollback()  # UNIQUE constraint — already selected, rollback cleanly

    row = get_auth_conn().execute(
        "SELECT * FROM selected_schemas WHERE connection_id=? AND catalog=? AND schema=?",
        (connection_id, catalog, schema),
    ).fetchone()
    return dict(row) if row else {"connection_id": connection_id, "catalog": catalog, "schema": schema}


def remove_schema(connection_id: str, catalog: str, schema: str) -> None:
    """Remove a schema and its cached table metadata."""
    with db_write_lock:
        db = get_auth_conn()
        db.execute(
            "DELETE FROM selected_schemas WHERE connection_id=? AND catalog=? AND schema=?",
            (connection_id, catalog, schema),
        )
        db.execute(
            "DELETE FROM table_metadata_cache WHERE connection_id=? AND catalog=? AND schema=?",
            (connection_id, catalog, schema),
        )
        db.commit()


# ── Sync ──────────────────────────────────────────────────────────────────────


def sync_schema(
    connector: DatabricksConnector,
    connection_id: str,
    catalog: str,
    schema: str,
) -> int:
    """
    Fetch all tables + columns for a schema from Databricks and persist to cache.
    Runs in a background thread. Returns table count.

    Per-table write pattern: fetch columns from Databricks (pure network I/O),
    then immediately write that single row under db_write_lock (< 1ms held).
    Tables appear in the explorer progressively as each one is fetched.
    db_write_lock serialises this with audit writes — no SQLITE_BUSY possible.
    """
    logger.info("Syncing schema %s.%s for connection %s", catalog, schema, connection_id)
    try:
        tables = connector.list_tables(catalog, schema)
    except Exception as exc:
        logger.error("Failed to list tables for %s.%s: %s", catalog, schema, exc)
        return 0

    synced_at = datetime.now(UTC).isoformat()
    count = 0

    for table in tables:
        # ── Network I/O: fetch columns — no lock held ────────────────────────
        try:
            cols = connector.list_columns(catalog, schema, table.name)
            columns_json = json.dumps([
                {"name": c.name, "type": c.type_text, "nullable": c.nullable}
                for c in cols
            ])
        except Exception as exc:
            logger.warning("Skipping columns for %s.%s.%s: %s", catalog, schema, table.name, exc)
            columns_json = "[]"

        # ── Write single row — lock held < 1ms ──────────────────────────────
        with db_write_lock:
            try:
                db = get_auth_conn()
                db.execute(
                    """INSERT INTO table_metadata_cache
                       (id, connection_id, catalog, schema, table_name, table_type, columns_json, synced_at)
                       VALUES (?,?,?,?,?,?,?,?)
                       ON CONFLICT(connection_id, catalog, schema, table_name)
                       DO UPDATE SET table_type=excluded.table_type,
                                     columns_json=excluded.columns_json,
                                     synced_at=excluded.synced_at""",
                    (
                        str(uuid.uuid4()), connection_id, catalog, schema,
                        table.name, table.table_type, columns_json, synced_at,
                    ),
                )
                db.commit()
                count += 1
            except Exception as exc:
                logger.warning("Failed to cache %s.%s.%s: %s", catalog, schema, table.name, exc)
                try:
                    db.rollback()
                except Exception:
                    pass

    # ── Mark schema fully synced ─────────────────────────────────────────────
    with db_write_lock:
        try:
            db = get_auth_conn()
            db.execute(
                "UPDATE selected_schemas SET synced_at=? WHERE connection_id=? AND catalog=? AND schema=?",
                (synced_at, connection_id, catalog, schema),
            )
            db.commit()
        except Exception as exc:
            logger.warning("Failed to mark schema synced for %s.%s: %s", catalog, schema, exc)
            try:
                db.rollback()
            except Exception:
                pass

    logger.info("Synced %d tables for %s.%s", count, catalog, schema)
    return count


def sync_all_schemas(connector: DatabricksConnector, connection_id: str) -> int:
    """Re-sync all selected schemas. Returns total table count."""
    schemas = get_selected_schemas(connection_id)
    total = 0
    for s in schemas:
        total += sync_schema(connector, connection_id, s["catalog"], s["schema"])
    return total


# ── Read cache ────────────────────────────────────────────────────────────────


def get_cached_tables(connection_id: str, catalog: str | None = None, schema: str | None = None) -> list[dict]:
    """Return cached tables, optionally filtered by catalog/schema. Volumes are excluded."""
    db = get_auth_conn()
    query = "SELECT * FROM table_metadata_cache WHERE connection_id=? AND table_type NOT IN ('VOLUME','FOREIGN')"
    params: list = [connection_id]
    if catalog:
        query += " AND catalog=?"
        params.append(catalog)
    if schema:
        query += " AND schema=?"
        params.append(schema)
    query += " ORDER BY catalog, schema, table_name"
    rows = db.execute(query, params).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        try:
            d["columns"] = json.loads(d.pop("columns_json", "[]"))
        except Exception:
            d["columns"] = []
        result.append(d)
    return result


def get_explorer_state(connection_id: str) -> dict:
    """Return full explorer state in one call — selected schemas + cached tables."""
    return {
        "selected_schemas": get_selected_schemas(connection_id),
        "tables": get_cached_tables(connection_id),
    }
