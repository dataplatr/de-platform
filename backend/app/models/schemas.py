from pydantic import BaseModel, Field
from typing import Any, Optional


# --- Auth ---

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: int
    created_at: str


class CreateUserRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    role: str = "analyst"


# --- DuckDB connection ---

class DuckDBConnectRequest(BaseModel):
    path: Optional[str] = None  # None = in-memory


# --- Schema browser ---

class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool = True


class TableInfo(BaseModel):
    name: str
    columns: list[ColumnInfo]


class SchemaInfo(BaseModel):
    name: str
    tables: list[TableInfo]


class DatabaseInfo(BaseModel):
    name: str
    schemas: list[SchemaInfo]


# --- Preview ---

class PreviewRequest(BaseModel):
    sql: str
    limit: int = Field(default=100, ge=1, le=1000)


class PreviewColumnInfo(BaseModel):
    name: str
    type: str  # mapped to frontend ColumnType string


class PreviewResult(BaseModel):
    columns: list[PreviewColumnInfo]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: float
    is_sampled: bool = False


# --- CSV upload ---

class CSVUploadResult(BaseModel):
    table_name: str
    row_count: int
    columns: list[ColumnInfo]


# --- SQL generation ---

class SQLGenerateRequest(BaseModel):
    transformation_type: str  # filter | join | aggregate | select
    config: dict[str, Any]
    input_tables: list[str]


class SQLGenerateResult(BaseModel):
    sql: str


# --- Chat ---

class ChatMessage(BaseModel):
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: Optional[dict[str, Any]] = None


class ChatResponse(BaseModel):
    message: ChatMessage
    suggested_nodes: Optional[list[dict[str, Any]]] = None


# --- Transformation pipeline ---

class NodeConfig(BaseModel):
    type: str
    label: str
    config: dict[str, Any] = {}
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})


class EdgeConfig(BaseModel):
    source: str
    target: str


class TransformationPipeline(BaseModel):
    id: Optional[str] = None
    name: str
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []


class ExecuteRequest(BaseModel):
    pipeline: TransformationPipeline
    output_table: Optional[str] = None


# --- Pipeline compile / preview ---

class CompileRequest(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    target_node_id: str


class CompileResult(BaseModel):
    sql: str
    target_node_id: str


class PipelinePreviewRequest(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    target_node_id: str
    limit: int = Field(default=100, ge=1, le=1000)


# --- Audit ---

class AuditLogEntry(BaseModel):
    id: int
    timestamp: str
    user_id: Optional[int]
    username: Optional[str]
    action: str
    method: Optional[str]
    path: Optional[str]
    status_code: Optional[int]
    ip_address: Optional[str]
    details: Optional[str]
