"""
SQL builder unit tests — verifies correct SQL output and injection prevention
for all transformation types.
"""
import pytest

from app.services.sql_builder import generate_sql


# ── Filter ────────────────────────────────────────────────────────────────────

def test_filter_equality() -> None:
    sql, params = generate_sql("filter", {
        "conditions": [{"column": "status", "operator": "=", "value": "active"}]
    }, ["orders"])
    assert "WHERE" in sql
    assert '"status" = ?' in sql
    assert params == ["active"]


def test_filter_in_operator() -> None:
    sql, params = generate_sql("filter", {
        "conditions": [{"column": "country", "operator": "IN", "value": ["US", "UK"]}]
    }, ["customers"])
    assert "IN (?, ?)" in sql
    assert params == ["US", "UK"]


def test_filter_is_null() -> None:
    sql, params = generate_sql("filter", {
        "conditions": [{"column": "email", "operator": "IS NULL", "value": None}]
    }, ["users"])
    assert '"email" IS NULL' in sql
    assert params == []


def test_filter_between() -> None:
    sql, params = generate_sql("filter", {
        "conditions": [{"column": "amount", "operator": "BETWEEN", "value": [10, 100]}]
    }, ["orders"])
    assert "BETWEEN ? AND ?" in sql
    assert params == [10, 100]


def test_filter_no_conditions_returns_select_star() -> None:
    sql, params = generate_sql("filter", {"conditions": []}, ["orders"])
    assert sql == 'SELECT * FROM "orders"'
    assert params == []


def test_filter_disallowed_operator_raises() -> None:
    with pytest.raises(ValueError, match="Disallowed filter operator"):
        generate_sql("filter", {
            "conditions": [{"column": "id", "operator": "DROP TABLE", "value": "x"}]
        }, ["orders"])


# ── Join ──────────────────────────────────────────────────────────────────────

def test_join_inner() -> None:
    sql, params = generate_sql("join", {
        "joinType": "INNER",
        "conditions": [{"leftCol": "customer_id", "rightCol": "id"}],
    }, ["orders", "customers"])
    assert "INNER JOIN" in sql
    assert '"orders"."customer_id" = "customers"."id"' in sql
    assert params == []


def test_join_left() -> None:
    sql, _ = generate_sql("join", {
        "joinType": "LEFT",
        "conditions": [],
    }, ["orders", "customers"])
    assert "LEFT JOIN" in sql


def test_join_disallowed_type_raises() -> None:
    with pytest.raises(ValueError, match="Disallowed join type"):
        generate_sql("join", {"joinType": "CROSS JOIN; DROP TABLE users--", "conditions": []}, ["a", "b"])


# ── Aggregate ─────────────────────────────────────────────────────────────────

def test_aggregate_sum() -> None:
    sql, params = generate_sql("aggregate", {
        "groupBy": ["country"],
        "measures": [{"function": "SUM", "column": "amount", "alias": "total_amount"}],
    }, ["orders"])
    assert 'SUM("amount") AS "total_amount"' in sql
    assert "GROUP BY" in sql
    assert params == []


def test_aggregate_count_distinct() -> None:
    sql, _ = generate_sql("aggregate", {
        "groupBy": [],
        "measures": [{"function": "COUNT_DISTINCT", "column": "customer_id", "alias": "unique_customers"}],
    }, ["orders"])
    assert 'COUNT(DISTINCT "customer_id")' in sql


def test_aggregate_disallowed_function_raises() -> None:
    with pytest.raises(ValueError, match="Disallowed aggregate function"):
        generate_sql("aggregate", {
            "groupBy": [],
            "measures": [{"function": "EXEC", "column": "id", "alias": "x"}],
        }, ["orders"])


# ── Select ────────────────────────────────────────────────────────────────────

def test_select_columns_with_alias() -> None:
    sql, params = generate_sql("select", {
        "columns": [
            {"source": "order_id", "alias": "id"},
            {"source": "amount", "alias": ""},
        ]
    }, ["orders"])
    assert '"order_id" AS "id"' in sql
    assert '"amount"' in sql
    assert params == []


def test_select_empty_returns_star() -> None:
    sql, _ = generate_sql("select", {"columns": []}, ["orders"])
    assert sql == 'SELECT * FROM "orders"'


# ── Deduplicate ───────────────────────────────────────────────────────────────

def test_deduplicate_basic() -> None:
    sql, params = generate_sql("deduplicate", {
        "partitionBy": ["customer_id"],
        "orderBy": "order_date",
        "orderDir": "DESC",
    }, ["orders"])
    assert "ROW_NUMBER()" in sql
    assert "PARTITION BY" in sql
    assert '"customer_id"' in sql
    assert params == []


def test_deduplicate_no_partition_returns_select_star() -> None:
    sql, _ = generate_sql("deduplicate", {"partitionBy": []}, ["orders"])
    assert sql == 'SELECT * FROM "orders"'


# ── SQL injection prevention ──────────────────────────────────────────────────

def test_injection_in_column_name_raises() -> None:
    with pytest.raises(ValueError, match="Invalid column"):
        generate_sql("filter", {
            "conditions": [{"column": "id; DROP TABLE users--", "operator": "=", "value": "1"}]
        }, ["orders"])


def test_injection_in_table_name_raises() -> None:
    with pytest.raises(ValueError):
        generate_sql("filter", {"conditions": []}, ["orders; DROP TABLE users--"])


def test_filter_value_is_parameterized_not_interpolated() -> None:
    """The SQL string must contain ? not the raw injected value."""
    malicious = "' OR '1'='1"
    sql, params = generate_sql("filter", {
        "conditions": [{"column": "name", "operator": "=", "value": malicious}]
    }, ["users"])
    assert malicious not in sql
    assert "?" in sql
    assert params == [malicious]


# ── Unknown type ──────────────────────────────────────────────────────────────

def test_unknown_transformation_type_raises() -> None:
    with pytest.raises(ValueError, match="Unknown transformation type"):
        generate_sql("explode", {}, ["orders"])
