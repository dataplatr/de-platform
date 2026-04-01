"""Schema introspection — queries information_schema and builds the DB tree."""
from app.db.connection import get_connection
from app.models.schemas import ColumnInfo, DatabaseInfo, SchemaInfo, TableInfo


def get_database_tree() -> list[DatabaseInfo]:
    conn = get_connection()
    raw = conn.execute("""
        SELECT table_catalog, table_schema, table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        ORDER BY table_catalog, table_schema, table_name, ordinal_position
    """).fetchall()

    # Build nested dict: catalog → schema → table → [columns]
    tree: dict[str, dict[str, dict[str, list[ColumnInfo]]]] = {}
    for catalog, schema, table, col, dtype, nullable in raw:
        (tree
         .setdefault(catalog, {})
         .setdefault(schema, {})
         .setdefault(table, [])
         .append(ColumnInfo(name=col, type=dtype, nullable=(nullable == "YES"))))

    result: list[DatabaseInfo] = []
    for cat_name, schemas in tree.items():
        schema_list: list[SchemaInfo] = []
        for schema_name, tables in schemas.items():
            if schema_name in ("information_schema", "pg_catalog"):
                continue
            table_list = [TableInfo(name=tbl, columns=cols) for tbl, cols in tables.items()]
            if table_list:
                schema_list.append(SchemaInfo(name=schema_name, tables=table_list))
        if schema_list:
            result.append(DatabaseInfo(name=cat_name, schemas=schema_list))
    return result
