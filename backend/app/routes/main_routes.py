from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from pydantic import BaseModel, Field
from typing import Any

from app.auth.auth import get_current_user, login, logout, require_role
from app.controllers import db_controller, chat_controller
from app.models.schemas import (
    LoginRequest,
    DuckDBConnectRequest,
    PreviewRequest,
    SQLGenerateRequest,
    ChatRequest,
    CreateUserRequest,
)
from app.services import user_service, audit_service, pipeline_service
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
    return db_controller.connect(req)


@router.get("/db/tree", dependencies=[Depends(get_current_user)])
def db_tree():
    return db_controller.get_tree()


@router.post("/db/preview", dependencies=[Depends(get_current_user)])
def db_preview(req: PreviewRequest):
    return db_controller.preview(req)


@router.post("/db/upload-csv", dependencies=[Depends(get_current_user)])
async def db_upload_csv(file: UploadFile = File(...)):
    try:
        return await db_controller.upload_csv(file)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/db/generate-sql", dependencies=[Depends(get_current_user)])
def db_generate_sql(req: SQLGenerateRequest):
    return db_controller.generate_sql(req)


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/chat", dependencies=[Depends(get_current_user)])
def chat(req: ChatRequest):
    return chat_controller.chat(req)


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
