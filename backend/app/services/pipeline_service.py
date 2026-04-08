"""Pipeline CRUD — centralises all pipeline DB access and response shaping."""
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

from app.db.auth_db import get_auth_conn


def _row_to_summary(row: Any) -> dict:
    return {
        "id":         row["id"],
        "name":       row["name"],
        "node_count": len(json.loads(row["nodes_json"])),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_to_detail(row: Any) -> dict:
    return {
        "id":         row["id"],
        "name":       row["name"],
        "nodes":      json.loads(row["nodes_json"]),
        "edges":      json.loads(row["edges_json"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_pipelines(user_id: int) -> list[dict]:
    rows = get_auth_conn().execute(
        "SELECT id, name, nodes_json, created_at, updated_at "
        "FROM pipelines WHERE user_id=? ORDER BY updated_at DESC",
        (user_id,),
    ).fetchall()
    return [_row_to_summary(r) for r in rows]


def create_pipeline(user_id: int, name: str, nodes: list, edges: list) -> dict:
    pid = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    conn = get_auth_conn()
    conn.execute(
        "INSERT INTO pipelines (id, user_id, name, nodes_json, edges_json, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (pid, user_id, name, json.dumps(nodes), json.dumps(edges), now, now),
    )
    conn.commit()
    return {"id": pid, "name": name, "created_at": now, "updated_at": now}


def get_pipeline(pipeline_id: str, user_id: int) -> dict:
    row = get_auth_conn().execute(
        "SELECT * FROM pipelines WHERE id=? AND user_id=?",
        (pipeline_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return _row_to_detail(row)


def update_pipeline(pipeline_id: str, user_id: int, name: str, nodes: list, edges: list) -> dict:
    now = datetime.now(UTC).isoformat()
    conn = get_auth_conn()
    result = conn.execute(
        "UPDATE pipelines SET name=?, nodes_json=?, edges_json=?, updated_at=? "
        "WHERE id=? AND user_id=?",
        (name, json.dumps(nodes), json.dumps(edges), now, pipeline_id, user_id),
    )
    conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {"id": pipeline_id, "name": name, "updated_at": now}


def delete_pipeline(pipeline_id: str, user_id: int) -> None:
    conn = get_auth_conn()
    conn.execute(
        "DELETE FROM pipelines WHERE id=? AND user_id=?",
        (pipeline_id, user_id),
    )
    conn.commit()
