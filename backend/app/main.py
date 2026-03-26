from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.main_routes import router
from app.db.connection import get_connection

app = FastAPI(
    title="Lakeflow Designer API",
    description="Backend for the AI-assisted data transformation pipeline builder",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
def startup():
    # Eagerly open DuckDB connection and seed demo data
    get_connection()
