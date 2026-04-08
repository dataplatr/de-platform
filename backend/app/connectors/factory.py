"""
Factory: create a typed connector from a stored Connection record.
Handles both PAT and OAuth connections — callers don't need to know which.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def get_connector(connection: dict):
    """Return the appropriate connector instance with a live token."""
    from app.connectors.databricks_connector import DatabricksConnector
    from app.services.connection_service import get_valid_token

    token = get_valid_token(connection)

    if connection["connector_type"] == "databricks":
        return DatabricksConnector(
            host=connection["host"],
            token=token,
            warehouse_id=connection.get("warehouse_id") or "",
        )

    raise ValueError(f"Unsupported connector type: {connection['connector_type']!r}")
