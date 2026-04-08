"""
Catalog browsing service — wraps CatalogProvider for use by routes.
Maps connector DTOs to the schema expected by the frontend (DatabaseTree format).
"""
from __future__ import annotations

from app.connectors.base import CatalogProvider, ColumnInfo


def _col_to_dict(c: ColumnInfo) -> dict:
    return {"name": c.name, "type": c.type_text, "nullable": c.nullable}


def get_catalogs(provider: CatalogProvider) -> list[dict]:
    """Return list of catalogs: [{ name }]"""
    return [{"name": c.name} for c in provider.list_catalogs()]


def get_schemas(provider: CatalogProvider, catalog: str) -> list[dict]:
    """Return list of schemas in a catalog: [{ name, catalog }]"""
    return [{"name": s.name, "catalog": s.catalog} for s in provider.list_schemas(catalog)]


def get_tables(provider: CatalogProvider, catalog: str, schema: str) -> list[dict]:
    """
    Return list of tables (NO columns — columns are fetched lazily).
    Returns: [{ name, catalog, schema, table_type }]
    """
    return [
        {
            "name": t.name,
            "catalog": t.catalog,
            "schema": t.schema,
            "table_type": t.table_type,
        }
        for t in provider.list_tables(catalog, schema)
    ]


def get_columns(provider: CatalogProvider, catalog: str, schema: str, table: str) -> list[dict]:
    """
    Fetch columns for a specific table (lazy — only called on explicit request).
    Returns: [{ name, type, nullable }]
    """
    return [_col_to_dict(c) for c in provider.list_columns(catalog, schema, table)]
