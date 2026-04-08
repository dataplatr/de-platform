import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.main_routes import router
from app.db.auth_db import init_auth_db
from app.middleware.audit_middleware import AuditMiddleware

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.ENV != "production" else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
# Quieten noisy third-party loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("databricks").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    init_auth_db()  # Create users/sessions/connections/audit tables, seed default users
    yield


app = FastAPI(
    title="Lakeflow Designer API",
    description="Backend for the AI-assisted data transformation pipeline builder",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the Vite dev server (proxy handles it in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit every request
app.add_middleware(AuditMiddleware)

app.include_router(router)
