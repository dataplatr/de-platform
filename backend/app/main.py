from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.main_routes import router
from app.db.connection import get_connection
from app.db.auth_db import init_auth_db
from app.middleware.audit_middleware import AuditMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    init_auth_db()    # Create users/sessions/audit tables, seed default users
    get_connection()  # Open DuckDB and seed demo tables
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
