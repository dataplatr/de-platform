from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from pydantic import BaseModel, Field
from typing import Any

from app.auth.auth import get_current_user, login, logout, require_role
from app.controllers import chat_controller
from app.models.schemas import (
    LoginRequest,
    DuckDBConnectRequest,
    PreviewRequest,
    SQLGenerateRequest,
    ChatRequest,
    CreateUserRequest,
    CompileRequest,
    PipelinePreviewRequest,
)
from app.services import user_service, audit_service, pipeline_service, compile_service
from app.services.csv_service import upload_csv
from app.services.query_service import preview_sql
from app.services.schema_service import get_database_tree
from app.services.sql_builder import generate_sql
from app.db.connection import reconnect
from app.constants import FORWARDED_FOR_HEADER


class PipelinePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    nodes: list[Any] = []
    edges: list[Any] = []


router = APIRouter(prefix="/api")


# ── Health ───────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {"status": "ok"}


# ── Auth ─────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
def auth_login(req: LoginRequest, request: Request):
    ip = request.headers.get(FORWARDED_FOR_HEADER, request.client.host if request.client else "")
    ua = request.headers.get("User-Agent", "")
    # Audit middleware logs the HTTP request; log the semantic LOGIN action here.
    result = login(req, ip=ip, ua=ua)
    return result


@router.post("/auth/logout")
def auth_logout(current: dict = Depends(get_current_user)):
    logout(current["jti"])
    return {"status": "logged out"}


@router.get("/auth/me")
def auth_me(current: dict = Depends(get_current_user)):
    user = user_service.get_user_by_id(current["id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ── User management (admin only) ─────────────────────────────────────────────

@router.get("/users", dependencies=[Depends(require_role("admin"))])
def list_users():
    return user_service.list_users()


@router.post("/users", dependencies=[Depends(require_role("admin"))])
def create_user(req: CreateUserRequest):
    return user_service.create_user(req.username, req.email, req.password, req.role)


@router.delete("/users/{user_id}", dependencies=[Depends(require_role("admin"))])
def deactivate_user(user_id: int):
    user_service.deactivate_user(user_id)
    return {"status": "deactivated"}


# ── Audit log (admin only) ────────────────────────────────────────────────────

@router.get("/audit", dependencies=[Depends(require_role("admin"))])
def get_audit_log(limit: int = 200, offset: int = 0):
    return audit_service.get_audit_log(limit=limit, offset=offset)


@router.get("/audit/me")
def my_activity(current: dict = Depends(get_current_user)):
    return audit_service.get_user_activity(current["id"])


# ── DuckDB / Schema ───────────────────────────────────────────────────────────

@router.post("/db/connect", dependencies=[Depends(get_current_user)])
def db_connect(req: DuckDBConnectRequest):
    path = req.path or ":memory:"
    conn = reconnect(path)
    version = conn.execute("SELECT version()").fetchone()[0]
    return {"status": "connected", "duckdb_version": version, "path": path}


@router.get("/db/tree", dependencies=[Depends(get_current_user)])
def db_tree():
    return get_database_tree()


@router.post("/db/preview", dependencies=[Depends(get_current_user)])
def db_preview(req: PreviewRequest):
    return preview_sql(req.sql, req.limit)


@router.post("/db/upload-csv", dependencies=[Depends(get_current_user)])
async def db_upload_csv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return upload_csv(content, file.filename)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/db/generate-sql",
    dependencies=[Depends(get_current_user)],
    deprecated=True,
    summary="[DEPRECATED] Use /pipelines/compile instead",
)
def db_generate_sql(req: SQLGenerateRequest):
    sql, _params = generate_sql(req.transformation_type, req.config, req.input_tables)
    from app.models.schemas import SQLGenerateResult
    return SQLGenerateResult(sql=sql)


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/chat", dependencies=[Depends(get_current_user)])
def chat(req: ChatRequest):
    return chat_controller.chat(req)


# ── Pipeline compile / preview ────────────────────────────────────────────────

@router.post("/pipelines/compile", dependencies=[Depends(get_current_user)])
def compile_pipeline_route(req: CompileRequest):
    try:
        sql = compile_service.compile_pipeline(req.nodes, req.edges, req.target_node_id)
        return {"sql": sql, "target_node_id": req.target_node_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pipelines/preview", dependencies=[Depends(get_current_user)])
def preview_pipeline_route(req: PipelinePreviewRequest):
    try:
        sql = compile_service.compile_pipeline(req.nodes, req.edges, req.target_node_id)
        return preview_sql(sql, req.limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Pipelines ─────────────────────────────────────────────────────────────────

@router.get("/pipelines")
def list_pipelines(current: dict = Depends(get_current_user)):
    return pipeline_service.list_pipelines(current["id"])


@router.post("/pipelines")
def create_pipeline(payload: PipelinePayload, current: dict = Depends(get_current_user)):
    return pipeline_service.create_pipeline(
        current["id"], payload.name, payload.nodes, payload.edges
    )


@router.get("/pipelines/{pipeline_id}")
def get_pipeline(pipeline_id: str, current: dict = Depends(get_current_user)):
    return pipeline_service.get_pipeline(pipeline_id, current["id"])


@router.put("/pipelines/{pipeline_id}")
def update_pipeline(pipeline_id: str, payload: PipelinePayload, current: dict = Depends(get_current_user)):
    return pipeline_service.update_pipeline(
        pipeline_id, current["id"], payload.name, payload.nodes, payload.edges
    )


@router.delete("/pipelines/{pipeline_id}")
def delete_pipeline(pipeline_id: str, current: dict = Depends(get_current_user)):
    pipeline_service.delete_pipeline(pipeline_id, current["id"])
    return {"status": "deleted"}
