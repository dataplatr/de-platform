"""
SQL generation for each transformation type.

Identifier safety: all column/table names are double-quoted via _qi().
Value safety: filter values are passed as DuckDB query parameters (?) — callers
receive both the SQL string and the bound params list.
"""
import re
from typing import Any

# Allowed aggregate functions — validated against this whitelist to prevent injection
_ALLOWED_AGG_FUNCS = frozenset({"SUM", "COUNT", "AVG", "MIN", "MAX", "COUNT_DISTINCT"})

# Allowed join types
_ALLOWED_JOIN_TYPES = frozenset({"INNER", "LEFT", "RIGHT", "FULL OUTER"})

# Allowed ORDER directions
_ALLOWED_ORDER_DIRS = frozenset({"ASC", "DESC"})

# Allowed filter operators
_ALLOWED_OPERATORS = frozenset({
    "=", "!=", ">", "<", ">=", "<=",
    "IN", "NOT IN", "BETWEEN", "IS NULL", "IS NOT NULL", "LIKE",
})


def _qi(name: str) -> str:
    """Quote an identifier safely — escapes embedded double-quotes."""
    return '"' + name.replace('"', '""') + '"'


def _validate_identifier(name: str, label: str = "identifier") -> str:
    """Ensure an identifier is non-empty and contains only safe characters."""
    if not name or not re.match(r'^[\w\s.]+$', name):
        raise ValueError(f"Invalid {label}: {name!r}")
    return name


def generate_sql(transformation_type: str, config: dict, input_tables: list[str]) -> tuple[str, list[Any]]:
    """
    Build SQL from a typed transformation config.

    Returns (sql_string, bound_params) so callers can execute safely.
    """
    if not input_tables:
        raise ValueError("At least one input table is required")

    for tbl in input_tables:
        _validate_identifier(tbl, "table")

    if transformation_type == "filter":
        return _build_filter_sql(input_tables[0], config)
    if transformation_type == "join":
        return _build_join_sql(input_tables, config)
    if transformation_type == "aggregate":
        return _build_aggregate_sql(input_tables[0], config)
    if transformation_type == "select":
        return _build_select_sql(input_tables[0], config)
    if transformation_type == "deduplicate":
        return _build_deduplicate_sql(input_tables[0], config)
    raise ValueError(f"Unknown transformation type: {transformation_type!r}")


def _build_filter_sql(table: str, config: dict) -> tuple[str, list[Any]]:
    conditions = config.get("conditions", [])
    if not conditions:
        return f"SELECT * FROM {_qi(table)}", []

    parts: list[str] = []
    params: list[Any] = []

    for c in conditions:
        col = _qi(_validate_identifier(c.get("column", ""), "column"))
        op = c.get("operator", "")
        if op not in _ALLOWED_OPERATORS:
            raise ValueError(f"Disallowed filter operator: {op!r}")
        val = c.get("value")

        if op in ("IS NULL", "IS NOT NULL"):
            parts.append(f"{col} {op}")
        elif op == "BETWEEN":
            # val expected as "low,high" or a two-element list
            if isinstance(val, list) and len(val) == 2:
                parts.append(f"{col} BETWEEN ? AND ?")
                params.extend(val)
            else:
                vals = str(val).split(",", 1)
                parts.append(f"{col} BETWEEN ? AND ?")
                params.extend(v.strip() for v in vals)
        elif op in ("IN", "NOT IN"):
            items = val if isinstance(val, list) else [v.strip() for v in str(val).split(",")]
            placeholders = ", ".join("?" * len(items))
            parts.append(f"{col} {op} ({placeholders})")
            params.extend(items)
        else:
            parts.append(f"{col} {op} ?")
            params.append(val)

    logic = config.get("logic", "AND").upper()
    if logic not in ("AND", "OR"):
        logic = "AND"
    where = f" {logic} ".join(parts)
    return f"SELECT * FROM {_qi(table)}\nWHERE {where}", params


def _build_join_sql(tables: list[str], config: dict) -> tuple[str, list[Any]]:
    left = _validate_identifier(tables[0], "left table")
    right = _validate_identifier(tables[1] if len(tables) > 1 else tables[0], "right table")
    join_type = config.get("joinType", "INNER").upper()
    if join_type not in _ALLOWED_JOIN_TYPES:
        raise ValueError(f"Disallowed join type: {join_type!r}")

    conditions = config.get("conditions", [])
    on_parts = []
    for c in conditions:
        lc = _qi(_validate_identifier(c.get("leftCol", ""), "leftCol"))
        rc = _qi(_validate_identifier(c.get("rightCol", ""), "rightCol"))
        on_parts.append(f"{_qi(left)}.{lc} = {_qi(right)}.{rc}")

    on_clause = " AND ".join(on_parts) if on_parts else "TRUE"
    sql = f"SELECT *\nFROM {_qi(left)}\n{join_type} JOIN {_qi(right)} ON {on_clause}"
    return sql, []


def _build_aggregate_sql(table: str, config: dict) -> tuple[str, list[Any]]:
    group_by = [_validate_identifier(c, "groupBy column") for c in config.get("groupBy", [])]
    measures = config.get("measures", [])

    select_parts = [_qi(c) for c in group_by]
    for m in measures:
        func = m.get("function", m.get("func", "")).upper()
        if func not in _ALLOWED_AGG_FUNCS:
            raise ValueError(f"Disallowed aggregate function: {func!r}")
        col = _qi(_validate_identifier(m.get("column", ""), "measure column"))
        raw_alias = m.get("alias") or f"{func.lower()}_{m.get('column', '')}"
        alias = _qi(_validate_identifier(raw_alias, "alias"))
        # COUNT_DISTINCT is written as COUNT(DISTINCT col) in standard SQL
        if func == "COUNT_DISTINCT":
            select_parts.append(f"COUNT(DISTINCT {col}) AS {alias}")
        else:
            select_parts.append(f"{func}({col}) AS {alias}")

    cols = ", ".join(select_parts) if select_parts else "*"
    sql = f"SELECT {cols}\nFROM {_qi(table)}"
    if group_by:
        sql += f"\nGROUP BY {', '.join(_qi(c) for c in group_by)}"
    return sql, []


def _build_select_sql(table: str, config: dict) -> tuple[str, list[Any]]:
    columns = config.get("columns", [])
    if not columns:
        return f"SELECT * FROM {_qi(table)}", []

    parts = []
    for col_def in columns:
        src = _qi(_validate_identifier(col_def.get("source", ""), "column"))
        alias_raw = col_def.get("alias", "")
        if alias_raw:
            alias = _qi(_validate_identifier(alias_raw, "alias"))
            parts.append(f"{src} AS {alias}")
        else:
            parts.append(src)

    return f"SELECT {', '.join(parts)}\nFROM {_qi(table)}", []


def _build_deduplicate_sql(table: str, config: dict) -> tuple[str, list[Any]]:
    partition_by = [_validate_identifier(c, "partitionBy column") for c in config.get("partitionBy", [])]
    order_by_raw = config.get("orderBy", "")
    order_dir = config.get("orderDir", "DESC").upper()
    if order_dir not in _ALLOWED_ORDER_DIRS:
        order_dir = "DESC"

    if not partition_by:
        return f"SELECT * FROM {_qi(table)}", []

    partition_clause = ", ".join(_qi(c) for c in partition_by)

    if order_by_raw:
        order_col = _qi(_validate_identifier(order_by_raw, "orderBy column"))
        order_clause = f"ORDER BY {order_col} {order_dir}"
    else:
        order_clause = "ORDER BY (SELECT NULL)"

    sql = (
        f"SELECT * FROM (\n"
        f"  SELECT *, ROW_NUMBER() OVER (\n"
        f"    PARTITION BY {partition_clause}\n"
        f"    {order_clause}\n"
        f"  ) AS __rn\n"
        f"  FROM {_qi(table)}\n"
        f") WHERE __rn = 1"
    )
    return sql, []
