"""
Pipeline compile service — walks the node graph from a target node upstream
and produces a single SQL string using nested subqueries.

Dialect support:
  - 'databricks': backtick-quoted identifiers (`catalog`.`schema`.`table`)
  - 'ansi': double-quoted identifiers ("catalog"."schema"."table")

P0 identifier constraint: catalog/schema/table names must NOT contain embedded dots.
  _qualified_name() splits on '.' and quotes each segment — this is safe as long as
  no segment itself contains a dot. Validated at connection-setup and drag-drop time.
"""
from __future__ import annotations

import re
from typing import Any

# ── Identifier quoting ────────────────────────────────────────────────────────

def _quote_identifier(name: str, dialect: str) -> str:
    """Quote a single identifier segment (no dots allowed inside)."""
    if dialect == "databricks":
        return "`" + name.replace("`", "``") + "`"
    # ANSI / fallback
    return '"' + name.replace('"', '""') + '"'


def _qualified_name(table_ref: str, dialect: str) -> str:
    """
    Quote each dot-separated segment of a table reference.
    Works for 2-part (schema.table) and 3-part (catalog.schema.table) refs.

    P0 constraint: segments themselves must not contain dots.
    Example:
      databricks: "catalog.schema.table" → `catalog`.`schema`.`table`
      ansi:       "catalog.schema.table" → "catalog"."schema"."table"
    """
    return ".".join(_quote_identifier(seg, dialect) for seg in table_ref.split("."))


def _validate_identifier(name: str, label: str = "identifier") -> str:
    """Ensure an identifier is non-empty and contains only safe characters."""
    if not name or not re.match(r'^[\w\s.]+$', name):
        raise ValueError(f"Invalid {label}: {name!r}")
    return name


# ── Graph helpers ─────────────────────────────────────────────────────────────

def _find_node(node_id: str, nodes: list[dict[str, Any]]) -> dict[str, Any] | None:
    for n in nodes:
        if n.get("id") == node_id:
            return n
    return None


def _incoming(node_id: str, edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [e for e in edges if e.get("target") == node_id]


def _edge_a(edges_in: list[dict[str, Any]]) -> dict[str, Any] | None:
    for e in edges_in:
        h = e.get("targetHandle")
        if h is None or h == "a":
            return e
    return None


def _edge_b(edges_in: list[dict[str, Any]]) -> dict[str, Any] | None:
    for e in edges_in:
        if e.get("targetHandle") == "b":
            return e
    return None


def _indent(sql: str, spaces: int = 2) -> str:
    pad = " " * spaces
    return sql.replace("\n", f"\n{pad}")


# ── SQL generation per node type ──────────────────────────────────────────────

def _sql_for(
    node_id: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    dialect: str,
    depth: int = 0,
) -> str:
    if depth > 50:
        raise ValueError("Pipeline graph has a cycle or is too deeply nested")

    node = _find_node(node_id, nodes)
    if node is None:
        return "-- Node not found"

    node_type = node.get("type", "")
    config = node.get("config") or {}
    inc = _incoming(node_id, edges)
    ea = _edge_a(inc)
    eb = _edge_b(inc)

    def _qi(name: str) -> str:
        return _quote_identifier(name, dialect)

    def upstream(edge: dict[str, Any] | None) -> str | None:
        if edge is None:
            return None
        return _sql_for(edge["source"], nodes, edges, dialect, depth + 1)

    # ── source ────────────────────────────────────────────────────────────────
    if node_type == "source":
        table = node.get("tableRef") or node.get("label") or "undefined_table"
        _validate_identifier(table, "table")
        return f"SELECT *\nFROM {_qualified_name(table, dialect)}"

    # ── filter ────────────────────────────────────────────────────────────────
    if node_type == "filter":
        up = upstream(ea)
        if not up:
            return "-- ⚠ Connect a source node"
        conditions: list[dict[str, Any]] = config if isinstance(config, list) else config.get("conditions", [])
        if not conditions:
            return f"SELECT *\nFROM (\n  {_indent(up)}\n) _f"
        logic = (conditions[0].get("logic") or "AND").upper()
        if logic not in ("AND", "OR"):
            logic = "AND"
        parts = []
        for c in conditions:
            col = _qi(_validate_identifier(c.get("column", ""), "column"))
            op = c.get("operator", "=")
            val = c.get("value")
            if op in ("IS NULL", "IS NOT NULL"):
                parts.append(f"{col} {op}")
            elif op == "BETWEEN":
                if isinstance(val, list) and len(val) == 2:
                    lo, hi = str(val[0]), str(val[1])
                else:
                    lo, hi = (str(val or "").split(",", 1) + [""])[:2]
                parts.append(f"{col} BETWEEN '{lo.strip()}' AND '{hi.strip()}'")
            elif op in ("IN", "NOT IN"):
                items = val if isinstance(val, list) else [v.strip() for v in str(val or "").split(",")]
                vals_str = ", ".join(f"'{v}'" for v in items)
                parts.append(f"{col} {op} ({vals_str})")
            elif op in (">", "<", ">=", "<="):
                v = str(val or "")
                is_num = v.lstrip("-").replace(".", "", 1).isdigit()
                parts.append(f"{col} {op} {v if is_num else repr(v)}")
            else:
                parts.append(f"{col} {op} '{val or ''}'")
        where = f"\n  {logic} ".join(parts)
        return f"SELECT *\nFROM (\n  {_indent(up)}\n) _f\nWHERE {where}"

    # ── join ──────────────────────────────────────────────────────────────────
    if node_type == "join":
        lsql = upstream(ea)
        rsql = upstream(eb)
        if not lsql:
            return "-- ⚠ Connect the LEFT source (top handle)"
        if not rsql:
            return "-- ⚠ Connect the RIGHT source (bottom handle)"
        cfg: dict[str, Any] = config if isinstance(config, dict) else {}
        join_type = cfg.get("joinType", "INNER").upper()
        allowed = {"INNER", "LEFT", "RIGHT", "FULL OUTER"}
        if join_type not in allowed:
            join_type = "INNER"
        conds = cfg.get("conditions", [])
        if conds:
            on_parts = [f"_l.{_qi(c['leftCol'])} = _r.{_qi(c['rightCol'])}" for c in conds]
            on = "\n    AND ".join(on_parts)
        else:
            on = "/* add join conditions in Config tab */"
        return (
            f"SELECT _l.*, _r.*\n"
            f"FROM (\n  {_indent(lsql)}\n) _l\n"
            f"{join_type} JOIN (\n  {_indent(rsql)}\n) _r\n"
            f"  ON {on}"
        )

    # ── aggregate ─────────────────────────────────────────────────────────────
    if node_type == "aggregate":
        up = upstream(ea)
        if not up:
            return "-- ⚠ Connect a source node"
        cfg = config if isinstance(config, dict) else {}
        group_by: list[str] = cfg.get("groupBy", [])
        measures: list[dict[str, Any]] = cfg.get("measures", [])
        selects = list(group_by)
        for m in measures:
            func = (m.get("func") or m.get("function") or "COUNT").upper()
            col = m.get("column", "")
            alias = m.get("alias") or f"{func.lower()}_{col}"
            if func == "COUNT_DISTINCT":
                selects.append(f"COUNT(DISTINCT {_qi(col)}) AS {_qi(alias)}")
            else:
                selects.append(f"{func}({_qi(col)}) AS {_qi(alias)}")
        if not selects:
            return f"SELECT *\nFROM (\n  {_indent(up)}\n) _a"
        gb = f"\nGROUP BY {', '.join(_qi(c) for c in group_by)}" if group_by else ""
        cols_str = ",\n  ".join(selects)
        return f"SELECT\n  {cols_str}\nFROM (\n  {_indent(up)}\n) _a{gb}"

    # ── select ────────────────────────────────────────────────────────────────
    if node_type == "select":
        up = upstream(ea)
        if not up:
            return "-- ⚠ Connect a source node"
        cfg = config if isinstance(config, dict) else {}
        cols_cfg: list[dict[str, Any]] = cfg.get("columns", [])
        if not cols_cfg:
            return f"SELECT *\nFROM (\n  {_indent(up)}\n) _s"
        col_parts = []
        for c in cols_cfg:
            src = _qi(_validate_identifier(c.get("source", ""), "column"))
            alias_raw = c.get("alias", "")
            col_parts.append(f"{src} AS {_qi(alias_raw)}" if alias_raw else src)
        cols_str = ",\n  ".join(col_parts)
        return f"SELECT\n  {cols_str}\nFROM (\n  {_indent(up)}\n) _s"

    # ── transform ─────────────────────────────────────────────────────────────
    if node_type == "transform":
        up = upstream(ea)
        if not up:
            return "-- ⚠ Connect a source node"
        cfg = config if isinstance(config, dict) else {}
        columns: list[dict[str, Any]] = cfg.get("columns", [])
        enabled = [c for c in columns if c.get("enabled")]
        if not enabled:
            return f"SELECT *\nFROM (\n  {_indent(up)}\n) _t"
        col_parts = []
        for c in enabled:
            out_name = c.get("outputName") or c.get("source") or "col"
            src = c.get("source") or "NULL"
            expr = c.get("expression", "")
            cast_type = c.get("castType", "")
            if expr:
                col_parts.append(f"({expr}) AS {_qi(out_name)}")
            else:
                base = f"CAST({_qi(src)} AS {cast_type})" if cast_type else _qi(src)
                col_parts.append(f"{base} AS {_qi(out_name)}" if out_name != src else base)
        cols_str = ",\n  ".join(col_parts)
        return f"SELECT\n  {cols_str}\nFROM (\n  {_indent(up)}\n) _t"

    # ── deduplicate ───────────────────────────────────────────────────────────
    if node_type == "deduplicate":
        up = upstream(ea)
        if not up:
            return "-- ⚠ Connect a source node"
        cfg = config if isinstance(config, dict) else {}
        partition_by: list[str] = cfg.get("partitionBy", [])
        order_by: str = cfg.get("orderBy", "")
        order_dir: str = cfg.get("orderDir", "DESC").upper()
        if order_dir not in ("ASC", "DESC"):
            order_dir = "DESC"
        if not partition_by:
            return f"SELECT DISTINCT *\nFROM (\n  {_indent(up)}\n) _d"
        part_clause = ", ".join(_qi(c) for c in partition_by)
        ord_clause = f"ORDER BY {_qi(order_by)} {order_dir}" if order_by else "ORDER BY (SELECT NULL)"
        return (
            f"SELECT *\nFROM (\n"
            f"  SELECT *, ROW_NUMBER() OVER (PARTITION BY {part_clause} {ord_clause}) AS _rn\n"
            f"  FROM (\n    {_indent(up, 4)}\n  ) _d\n"
            f") _dedup\nWHERE _rn = 1"
        )

    # ── output ────────────────────────────────────────────────────────────────
    if node_type == "output":
        if not inc:
            return "-- ⚠ Connect at least one node to the Output"
        cfg = config if isinstance(config, dict) else {}
        table = cfg.get("targetTable") or node.get("label") or "output"
        if len(inc) == 1:
            up = upstream(inc[0])
            if not up:
                return "-- ⚠ No upstream node"
            return f"-- Output: {table}\n{up}"
        parts = [_sql_for(e["source"], nodes, edges, dialect, depth + 1) for e in inc]
        return f"-- Output: {table} ({len(parts)} sources)\n" + "\n\nUNION ALL\n\n".join(parts)

    return f"-- Unknown node type: {node_type}"


# ── Public API ────────────────────────────────────────────────────────────────

def _check_warnings(sql: str) -> None:
    """Raise ValueError if the SQL contains any ⚠ placeholder comments."""
    warnings = [
        line.strip()[len("--"):].strip()
        for line in sql.splitlines()
        if line.strip().startswith("--") and "⚠" in line
    ]
    if warnings:
        raise ValueError("Pipeline has configuration errors:\n" + "\n".join(f"  • {w}" for w in warnings))


def compile_pipeline(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    target_node_id: str,
    dialect: str = "databricks",
) -> str:
    """
    Walk the node graph from target_node_id upstream and return the composed SQL.
    Raises ValueError for invalid graphs or identifiers.
    """
    node = _find_node(target_node_id, nodes)
    if node is None:
        raise ValueError(f"Target node {target_node_id!r} not found in pipeline")
    sql = _sql_for(target_node_id, nodes, edges, dialect)
    _check_warnings(sql)
    return sql


def compile_to_cte(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    output_node_id: str,
    dialect: str = "databricks",
) -> str:
    """
    Compile the full pipeline to a CREATE OR REPLACE TABLE … AS (…) statement.

    Calls compile_pipeline on the output node directly to preserve all output-node
    semantics (e.g. UNION ALL for multiple inputs). The output node's config provides
    the target catalog, schema, and table name.

    Requires OutputConfig fields: targetCatalog, targetSchema, targetTable.
    """
    out_node = _find_node(output_node_id, nodes)
    if out_node is None:
        raise ValueError(f"Output node {output_node_id!r} not found")

    cfg = out_node.get("config") or {}
    target_catalog = cfg.get("targetCatalog", "").strip()
    target_schema = cfg.get("targetSchema", "").strip()
    target_table = cfg.get("targetTable", "").strip()

    if not target_catalog or not target_schema or not target_table:
        raise ValueError(
            "Output node must have targetCatalog, targetSchema, and targetTable configured"
        )

    # Build quoted 3-part target identifier
    target_ref = f"{target_catalog}.{target_schema}.{target_table}"
    quoted_target = _qualified_name(target_ref, dialect)

    # compile_pipeline on the output node — output handler emits SELECT from upstream
    inner_sql = compile_pipeline(nodes, edges, output_node_id, dialect)

    # Strip the "-- Output: <table>" comment prefix emitted by the output node handler
    # so we get clean SQL for wrapping
    lines = inner_sql.splitlines()
    if lines and lines[0].startswith("-- Output:"):
        inner_sql = "\n".join(lines[1:]).lstrip("\n")

    return f"CREATE OR REPLACE TABLE {quoted_target} AS (\n  {_indent(inner_sql)}\n)"
