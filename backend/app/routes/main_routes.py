from fastapi import APIRouter, Depends, UploadFile, File

from app.auth.auth import get_current_user, login
from app.controllers import db_controller, chat_controller
from app.models.schemas import (
    LoginRequest,
    DuckDBConnectRequest,
    PreviewRequest,
    SQLGenerateRequest,
    ChatRequest,
)

router = APIRouter(prefix="/api")


# ── Health ───────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {"status": "ok"}


# ── Auth ─────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
def auth_login(req: LoginRequest):
    return login(req)


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
