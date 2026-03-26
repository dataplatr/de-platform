from fastapi import UploadFile
from app.models.schemas import (
    DuckDBConnectRequest,
    PreviewRequest,
    SQLGenerateRequest,
    SQLGenerateResult,
)
from app.services import duckdb_service


def connect(req: DuckDBConnectRequest) -> dict:
    return duckdb_service.connect_db(req.path)


def get_tree() -> list:
    return duckdb_service.get_database_tree()


def preview(req: PreviewRequest):
    return duckdb_service.preview_sql(req.sql, req.limit)


async def upload_csv(file: UploadFile):
    content = await file.read()
    return duckdb_service.upload_csv(content, file.filename)


def generate_sql(req: SQLGenerateRequest) -> SQLGenerateResult:
    sql = duckdb_service.generate_sql(
        req.transformation_type, req.config, req.input_tables
    )
    return SQLGenerateResult(sql=sql)
