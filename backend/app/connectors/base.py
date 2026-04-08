"""
Abstract connector interfaces — all compute connectors implement these.
First implementation: DatabricksConnector.
Adding Snowflake later = new file implementing these same ABCs, no service layer changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

# ── Data-transfer objects ─────────────────────────────────────────────────────

@dataclass
class CatalogInfo:
    name: str

@dataclass
class SchemaInfo:
    name: str
    catalog: str

@dataclass
class TableInfo:
    name: str
    catalog: str
    schema: str
    table_type: str  # 'TABLE' | 'VIEW' | 'EXTERNAL' | 'MANAGED'

@dataclass
class ColumnInfo:
    name: str
    type_text: str          # raw connector type string, e.g. "STRING", "BIGINT"
    nullable: bool = True

@dataclass
class PreviewResult:
    columns: list[ColumnInfo]
    rows: list[list]
    row_count: int
    execution_ms: float
    truncated: bool = False

@dataclass
class MaterializeResult:
    execution_ms: float
    statement_id: str
    target_table: str
    status: str             # 'SUCCEEDED' | 'FAILED'
    row_count: int | None = None   # only filled if a follow-up COUNT(*) is run

@dataclass
class UploadResult:
    table_ref: str          # "catalog.schema.table" (plain dots, for UI display)
    row_count: int
    columns: list[ColumnInfo] = field(default_factory=list)


# ── Abstract interfaces ───────────────────────────────────────────────────────

class CatalogProvider(ABC):
    """Browse catalog/schema/table/column hierarchy."""

    @abstractmethod
    def list_catalogs(self) -> list[CatalogInfo]: ...

    @abstractmethod
    def list_schemas(self, catalog: str) -> list[SchemaInfo]: ...

    @abstractmethod
    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]: ...

    @abstractmethod
    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]: ...


class QueryExecutor(ABC):
    """Execute SQL statements on the remote compute plane."""

    @abstractmethod
    def execute_preview(self, sql: str, limit: int = 100) -> PreviewResult: ...

    @abstractmethod
    def execute_materialize(self, sql: str) -> MaterializeResult: ...


class UploadProvider(ABC):
    """Stage local files (CSV) into the remote compute plane."""

    @abstractmethod
    def upload_csv(
        self,
        file_bytes: bytes,
        filename: str,
        upload_catalog: str,
        upload_schema: str,
        upload_volume: str,
    ) -> UploadResult: ...
