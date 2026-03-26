from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException

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
from app.services import user_service, audit_service

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
    return await db_controller.upload_csv(file)


@router.post("/db/generate-sql", dependencies=[Depends(get_current_user)])
def db_generate_sql(req: SQLGenerateRequest):
    return db_controller.generate_sql(req)


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/chat", dependencies=[Depends(get_current_user)])
def chat(req: ChatRequest):
    return chat_controller.chat(req)
