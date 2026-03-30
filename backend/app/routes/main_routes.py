import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Any

from app.auth.auth import get_current_user, login, logout, require_role
from app.controllers import db_controller, chat_controller
from app.db.auth_db import get_auth_conn
from app.models.schemas import (
    LoginRequest,
    DuckDBConnectRequest,
    PreviewRequest,
    SQLGenerateRequest,
    ChatRequest,
    CreateUserRequest,
)
from app.services import user_service, audit_service


class PipelinePayload(BaseModel):
    name: str
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
    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "")
    ua = request.headers.get("User-Agent", "")
    result = login(req, ip=ip, ua=ua)
    audit_service.log_activity(
        action="LOGIN",
        username=req.username,
        ip_address=ip,
        user_agent=ua,
        details="success",
    )
    return result


@router.post("/auth/logout")
def auth_logout(current: dict = Depends(get_current_user)):
    logout(current["jti"])
    audit_service.log_activity(
        action="LOGOUT",
        user_id=current["id"],
        username=current["username"],
    )
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
    except RuntimeError as exc:
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
    conn = get_auth_conn()
    rows = conn.execute(
        "SELECT id, name, nodes_json, created_at, updated_at FROM pipelines WHERE user_id=? ORDER BY updated_at DESC",
        (current["id"],)
    ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "node_count": len(json.loads(r["nodes_json"])),
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]


@router.post("/pipelines")
def create_pipeline(payload: PipelinePayload, current: dict = Depends(get_current_user)):
    conn = get_auth_conn()
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO pipelines (id, user_id, name, nodes_json, edges_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        (pid, current["id"], payload.name, json.dumps(payload.nodes), json.dumps(payload.edges), now, now)
    )
    conn.commit()
    return {"id": pid, "name": payload.name, "created_at": now, "updated_at": now}


@router.get("/pipelines/{pipeline_id}")
def get_pipeline(pipeline_id: str, current: dict = Depends(get_current_user)):
    conn = get_auth_conn()
    row = conn.execute(
        "SELECT * FROM pipelines WHERE id=? AND user_id=?", (pipeline_id, current["id"])
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {
        "id": row["id"],
        "name": row["name"],
        "nodes": json.loads(row["nodes_json"]),
        "edges": json.loads(row["edges_json"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.put("/pipelines/{pipeline_id}")
def update_pipeline(pipeline_id: str, payload: PipelinePayload, current: dict = Depends(get_current_user)):
    conn = get_auth_conn()
    now = datetime.now(timezone.utc).isoformat()
    result = conn.execute(
        "UPDATE pipelines SET name=?, nodes_json=?, edges_json=?, updated_at=? WHERE id=? AND user_id=?",
        (payload.name, json.dumps(payload.nodes), json.dumps(payload.edges), now, pipeline_id, current["id"])
    )
    conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {"id": pipeline_id, "updated_at": now}


@router.delete("/pipelines/{pipeline_id}")
def delete_pipeline(pipeline_id: str, current: dict = Depends(get_current_user)):
    conn = get_auth_conn()
    conn.execute("DELETE FROM pipelines WHERE id=? AND user_id=?", (pipeline_id, current["id"]))
    conn.commit()
    return {"status": "deleted"}
