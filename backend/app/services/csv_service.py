"""CSV upload — loads a file into DuckDB as a named table."""
import logging
import os
import re
import tempfile

import duckdb

from app.db.connection import get_connection, reconnect
from app.models.schemas import ColumnInfo, CSVUploadResult

logger = logging.getLogger(__name__)

# Only allow table names that are safe SQL identifiers
_SAFE_IDENTIFIER = re.compile(r'^[a-z][a-z0-9_]{0,62}$')


def _sanitize_table_name(filename: str) -> str:
    name = os.path.splitext(filename)[0]
    name = name.lower().replace("-", "_").replace(" ", "_")
    # Strip any remaining non-alphanumeric/underscore characters
    name = re.sub(r'[^a-z0-9_]', '', name)
    if not name or not name[0].isalpha():
        name = f"tbl_{name}" if name else "uploaded_table"
    return name[:63]  # DuckDB identifier length limit


def upload_csv(file_bytes: bytes, filename: str) -> CSVUploadResult:
    if not filename:
        raise ValueError("Filename must not be empty")
    if len(file_bytes) == 0:
        raise ValueError("Uploaded file is empty")

    table_name = _sanitize_table_name(filename)
    if not _SAFE_IDENTIFIER.match(table_name):
        raise ValueError(f"Could not derive a safe table name from filename: {filename!r}")

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        return _do_upload(tmp_path, table_name)
    except duckdb.TransactionException:
        # Another process holds the write lock — reconnect and retry once.
        logger.warning("DuckDB write lock conflict on upload; reconnecting and retrying")
        try:
            reconnect()
            return _do_upload(tmp_path, table_name)
        except duckdb.TransactionException as exc:
            raise RuntimeError(
                "DuckDB write lock conflict: another process is holding an exclusive "
                "lock on the database file. Disconnect any external DuckDB tool and retry."
            ) from exc
    finally:
        os.unlink(tmp_path)


def _do_upload(tmp_path: str, table_name: str) -> CSVUploadResult:
    conn = get_connection()
    # tmp_path is a trusted server-side temp path — safe to interpolate.
    # table_name is validated above; we double-quote it for safety.
    quoted = f'"{table_name}"'
    conn.execute(f"""
        CREATE OR REPLACE TABLE {quoted} AS
        SELECT * FROM read_csv_auto(?, header=true)
    """, [tmp_path])

    count = conn.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
    cols_raw = conn.execute(
        """SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = ?
           ORDER BY ordinal_position""",
        [table_name],
    ).fetchall()
    columns = [ColumnInfo(name=r[0], type=r[1], nullable=(r[2] == "YES")) for r in cols_raw]
    return CSVUploadResult(table_name=table_name, row_count=count, columns=columns)
