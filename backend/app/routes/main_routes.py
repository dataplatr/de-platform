import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, Form, Request, UploadFile, File, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from typing import Any

from app.auth.auth import get_current_user, login, logout, require_role
from app.controllers import chat_controller
from app.models.schemas import (
    LoginRequest,
    CreateUserRequest,
    ChatRequest,
    CompileRequest,
    PipelinePreviewRequest,
    CreateConnectionRequest,
    DiscoverWarehousesRequest,
    TestConnectionRequest,
    TestConnectionResult,
    ConnectionResponse,
    PipelineRunRequest,
)
from app.services import user_service, audit_service, pipeline_service, compile_service
from app.services import connection_service, catalog_service, query_service, schema_cache_service
from app.services import oauth_service
from app.connectors.factory import get_connector
from app.config import settings
from app.constants import FORWARDED_FOR_HEADER

logger = logging.getLogger(__name__)

# Background thread pool for schema sync (no Celery needed)
_sync_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="schema-sync")


class PipelinePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    nodes: list[Any] = []
    edges: list[Any] = []


class OAuthStartRequest(BaseModel):
    workspace_url: str
    connection_name: str = ""
    connection_alias: str


class UpdateConnectionRequest(BaseModel):
    warehouse_id: str = ""
    upload_catalog: str = ""
    upload_schema: str = ""
    upload_volume: str = ""
    name: str = ""


class AddSchemaRequest(BaseModel):
    catalog: str
    schema: str


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
    return login(req, ip=ip, ua=ua)


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


# ── Connections ───────────────────────────────────────────────────────────────

@router.post("/connections", response_model=ConnectionResponse)
def create_connection(req: CreateConnectionRequest, current: dict = Depends(get_current_user)):
    try:
        conn = connection_service.create_connection(current["id"], req.model_dump())
        return _strip_token(conn)
    except ValueError as exc:
        status = 409 if "already in use" in str(exc) else 422
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.get("/connections", response_model=list[ConnectionResponse])
def list_connections(current: dict = Depends(get_current_user)):
    return connection_service.list_connections(current["id"])


@router.delete("/connections/{connection_id}")
def delete_connection(connection_id: str, current: dict = Depends(get_current_user)):
    try:
        connection_service.delete_connection(connection_id, current["id"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}


@router.post("/connections/test", response_model=TestConnectionResult)
def test_connection(req: TestConnectionRequest, _: dict = Depends(get_current_user)):
    ok, err = connection_service.test_connection_credentials(req.host, req.token, req.warehouse_id)
    return TestConnectionResult(success=ok, error=err)


@router.post("/connections/discover-warehouses")
def discover_warehouses(req: DiscoverWarehousesRequest, _: dict = Depends(get_current_user)):
    """Validate PAT credentials and return available SQL warehouses — no connection record created."""
    from app.connectors.databricks_connector import DatabricksConnector
    try:
        connector = DatabricksConnector(host=req.host.strip().rstrip("/"), token=req.token.strip())
        return connector.list_warehouses()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/connections/{connection_id}")
def update_connection(
    connection_id: str,
    req: UpdateConnectionRequest,
    current: dict = Depends(get_current_user),
):
    try:
        conn = connection_service.update_connection(connection_id, current["id"], req.model_dump(exclude_none=True))
        return _strip_token(conn)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── OAuth 2.0 / PKCE ─────────────────────────────────────────────────────────

@router.post("/connections/oauth/start")
def oauth_start(req: OAuthStartRequest, current: dict = Depends(get_current_user)):
    """
    Begin the Databricks OAuth flow.
    Returns { auth_url } — the frontend opens this in a popup.
    """
    workspace_url = req.workspace_url.strip().rstrip("/")
    if not workspace_url.startswith("https://"):
        raise HTTPException(status_code=422, detail="workspace_url must start with https://")

    client_id = settings.DATABRICKS_OAUTH_CLIENT_ID.strip()
    if not client_id:
        raise HTTPException(
            status_code=422,
            detail="DATABRICKS_OAUTH_CLIENT_ID is not configured. "
                   "Set it in your .env file (register an OAuth app in your Databricks workspace "
                   "under Settings → Developer → App registrations)."
        )

    auth_url = oauth_service.create_auth_url(
        workspace_url=workspace_url,
        client_id=client_id,
        redirect_uri=settings.OAUTH_REDIRECT_URI,
        user_id=current["id"],
        connection_name=req.connection_name.strip() or req.connection_alias.strip(),
        connection_alias=req.connection_alias.strip(),
    )
    return {"auth_url": auth_url}


@router.get("/connections/oauth/callback")
def oauth_callback(code: str = "", state: str = "", error: str = ""):
    """
    Databricks redirects here after the user authorizes the app.
    Exchanges the code for tokens, creates the connection, then redirects
    the popup to the frontend oauth-callback page.
    """
    frontend_base = settings.FRONTEND_URL.rstrip("/")

    if error:
        return RedirectResponse(f"{frontend_base}/oauth-callback.html?error={error}")

    ctx = oauth_service.consume_state(state)
    if ctx is None:
        return RedirectResponse(f"{frontend_base}/oauth-callback.html?error=invalid_state")

    try:
        token_data = oauth_service.exchange_code(
            workspace_url=ctx["workspace_url"],
            client_id=ctx["client_id"],
            code=code,
            code_verifier=ctx["code_verifier"],
            redirect_uri=ctx["redirect_uri"],
        )
    except Exception as exc:
        import urllib.parse
        msg = urllib.parse.quote(str(exc))
        return RedirectResponse(f"{frontend_base}/oauth-callback.html?error={msg}")

    try:
        conn = connection_service.create_oauth_connection(
            user_id=ctx["user_id"],
            alias=ctx["connection_alias"],
            name=ctx["connection_name"],
            host=ctx["workspace_url"],
            client_id=ctx["client_id"],
            access_token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token", ""),
            expires_in=int(token_data.get("expires_in", 3600)),
        )
        return RedirectResponse(
            f"{frontend_base}/oauth-callback.html?connection_id={conn['id']}"
        )
    except ValueError as exc:
        import urllib.parse
        msg = urllib.parse.quote(str(exc))
        return RedirectResponse(f"{frontend_base}/oauth-callback.html?error={msg}")


# ── Warehouse listing ─────────────────────────────────────────────────────────

@router.get("/connections/{connection_id}/warehouses")
def list_warehouses(connection_id: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    try:
        return connector.list_warehouses()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Schema metadata cache ─────────────────────────────────────────────────────

@router.get("/connections/{connection_id}/selected-schemas")
def get_selected_schemas(connection_id: str, current: dict = Depends(get_current_user)):
    _get_conn(connection_id, current["id"])  # verify ownership
    return schema_cache_service.get_selected_schemas(connection_id)


@router.post("/connections/{connection_id}/selected-schemas")
def add_schema(connection_id: str, req: AddSchemaRequest, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    result = schema_cache_service.add_schema(connection_id, req.catalog, req.schema)
    # Sync in background — returns immediately
    connector = get_connector(conn)
    _sync_executor.submit(
        schema_cache_service.sync_schema, connector, connection_id, req.catalog, req.schema
    )
    logger.info("Schema %s.%s added for connection %s — sync started in background", req.catalog, req.schema, connection_id)
    return {**result, "status": "syncing"}


@router.delete("/connections/{connection_id}/selected-schemas/{catalog}/{schema}")
def remove_schema(connection_id: str, catalog: str, schema: str, current: dict = Depends(get_current_user)):
    _get_conn(connection_id, current["id"])
    schema_cache_service.remove_schema(connection_id, catalog, schema)
    return {"status": "removed"}


@router.get("/connections/{connection_id}/cached-tables")
def get_cached_tables(connection_id: str, current: dict = Depends(get_current_user)):
    _get_conn(connection_id, current["id"])
    return schema_cache_service.get_explorer_state(connection_id)


@router.post("/connections/{connection_id}/sync")
def sync_schemas(connection_id: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    _sync_executor.submit(schema_cache_service.sync_all_schemas, connector, connection_id)
    logger.info("Full re-sync started for connection %s", connection_id)
    return {"status": "syncing"}


# ── Warehouse lifecycle ────────────────────────────────────────────────────────

@router.post("/connections/{connection_id}/warehouse/start")
def warehouse_start(connection_id: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    connector.start_warehouse()
    return {"status": "starting"}


@router.post("/connections/{connection_id}/warehouse/stop")
def warehouse_stop(connection_id: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    connector.stop_warehouse()
    return {"status": "stopping"}


@router.get("/connections/{connection_id}/warehouse/status")
def warehouse_status(connection_id: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    state = connector.get_warehouse_status()
    return {"state": state}


# ── Catalog tree (lazy) ───────────────────────────────────────────────────────

@router.get("/connections/{connection_id}/tree")
def list_catalogs(connection_id: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    try:
        return catalog_service.get_catalogs(connector)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/connections/{connection_id}/tree/{catalog}")
def list_schemas(connection_id: str, catalog: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    try:
        return catalog_service.get_schemas(connector, catalog)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/connections/{connection_id}/tree/{catalog}/{schema}")
def list_tables(connection_id: str, catalog: str, schema: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    try:
        return catalog_service.get_tables(connector, catalog, schema)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/connections/{connection_id}/tree/{catalog}/{schema}/volumes")
def list_volumes(connection_id: str, catalog: str, schema: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    try:
        return connector.list_volumes(catalog, schema)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class CreateVolumeRequest(BaseModel):
    name: str


@router.post("/connections/{connection_id}/tree/{catalog}/{schema}/volumes")
def create_volume(connection_id: str, catalog: str, schema: str, req: CreateVolumeRequest, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    try:
        return connector.create_volume(catalog, schema, req.name.strip())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/connections/{connection_id}/tree/{catalog}/{schema}/{table}/columns")
def list_columns(connection_id: str, catalog: str, schema: str, table: str, current: dict = Depends(get_current_user)):
    conn = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)
    try:
        return catalog_service.get_columns(connector, catalog, schema, table)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── CSV upload ────────────────────────────────────────────────────────────────

@router.post("/connections/{connection_id}/upload-csv")
async def upload_csv(
    connection_id: str,
    file: UploadFile = File(...),
    target_catalog:  str = Form(""),
    target_schema:   str = Form(""),
    table_name:      str = Form(""),
    upload_volume:   str = Form(""),   # staging volume — sent explicitly from the UI
    current: dict = Depends(get_current_user),
):
    conn      = _get_conn(connection_id, current["id"])
    connector = get_connector(conn)

    # ── Validate BEFORE reading file bytes (fail fast, no partial upload) ──
    try:
        connector._resolve_warehouse()  # auto-discovers if warehouse_id is empty
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Volume: prefer the value passed from the UI, fall back to saved connection config
    staging_volume = upload_volume.strip() or conn.get("upload_volume", "").strip()
    if not staging_volume:
        raise HTTPException(
            status_code=422,
            detail="No staging volume configured. Select a volume in the upload form.",
        )

    # Catalog/schema: prefer form values, fall back to saved defaults
    final_catalog = target_catalog.strip() or conn.get("upload_catalog", "").strip()
    final_schema  = target_schema.strip()  or conn.get("upload_schema",  "").strip()
    if not final_catalog or not final_schema:
        raise HTTPException(status_code=422, detail="Target catalog and schema are required.")

    try:
        content = await file.read()
        result = connector.upload_csv(
            file_bytes=content,
            filename=table_name.strip() or file.filename or "upload.csv",
            upload_catalog=final_catalog,
            upload_schema=final_schema,
            upload_volume=staging_volume,
        )
        return {
            "table_ref": result.table_ref,
            "row_count": result.row_count,
            "columns": [{"name": c.name, "type": c.type_text, "nullable": c.nullable} for c in result.columns],
        }
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ── Pipeline compile / preview / run ─────────────────────────────────────────

@router.post("/pipelines/compile")
def compile_pipeline_route(req: CompileRequest, _: dict = Depends(get_current_user)):
    try:
        sql = compile_service.compile_pipeline(req.nodes, req.edges, req.target_node_id)
        return {"sql": sql, "target_node_id": req.target_node_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/pipelines/preview")
def preview_pipeline_route(req: PipelinePreviewRequest, current: dict = Depends(get_current_user)):
    logger.info("Preview: user=%s alias=%s node=%s", current["id"], req.connection_alias, req.target_node_id)
    try:
        conn_record = connection_service.get_connection_by_alias(req.connection_alias, current["id"])
        connector = get_connector(conn_record)
        sql = compile_service.compile_pipeline(req.nodes, req.edges, req.target_node_id)
        logger.debug("Preview SQL:\n%s", sql)
        result = query_service.preview(connector, sql, req.limit)
        logger.info("Preview OK: %d rows", result.get("row_count", 0))
        return result
    except ValueError as exc:
        logger.warning("Preview validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimeoutError as exc:
        logger.warning("Preview timeout: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Preview failed")
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/pipelines/run")
def run_pipeline_route(req: PipelineRunRequest, current: dict = Depends(get_current_user)):
    logger.info("Run: user=%s alias=%s output_node=%s", current["id"], req.connection_alias, req.output_node_id)
    try:
        conn_record = connection_service.get_connection_by_alias(req.connection_alias, current["id"])
        connector = get_connector(conn_record)
        create_sql = compile_service.compile_to_cte(
            req.nodes, req.edges, req.output_node_id, req.dialect
        )
        out_node = next((n for n in req.nodes if n.get("id") == req.output_node_id), {})
        cfg = out_node.get("config") or {}
        target = f"{cfg.get('targetCatalog','')}.{cfg.get('targetSchema','')}.{cfg.get('targetTable','')}"
        logger.info("Materializing into: %s", target)
        logger.debug("Run SQL:\n%s", create_sql)
        return query_service.materialize(connector, create_sql, target)
    except ValueError as exc:
        logger.warning("Run validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimeoutError as exc:
        logger.warning("Run timeout: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Run failed")
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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


# ── Chat ──────────────────────────────────────────────────────────────────────

@router.post("/chat", dependencies=[Depends(get_current_user)])
def chat(req: ChatRequest):
    return chat_controller.chat(req)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_conn(connection_id: str, user_id: int) -> dict:
    try:
        return connection_service.get_connection(connection_id, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _strip_token(conn: dict) -> dict:
    """Return connection dict without the encrypted token."""
    return {k: v for k, v in conn.items() if k != "token_enc"}
