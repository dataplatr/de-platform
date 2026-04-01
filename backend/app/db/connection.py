import logging
import threading
from pathlib import Path

import duckdb

from app.config import settings

_local = threading.local()
logger = logging.getLogger(__name__)


def get_connection() -> duckdb.DuckDBPyConnection:
    """Return a per-thread DuckDB connection (thread-local, created on first use)."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = _create_connection(settings.DUCKDB_PATH)
    return _local.conn


def _create_connection(path: str) -> duckdb.DuckDBPyConnection:
    if path == ":memory:":
        conn = duckdb.connect(":memory:")
    else:
        db_path = Path(path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = duckdb.connect(str(db_path))
    _seed_demo_data(conn)
    return conn


def reconnect(path: str | None = None) -> duckdb.DuckDBPyConnection:
    """Close the current thread's connection and open a fresh one."""
    if hasattr(_local, "conn") and _local.conn is not None:
        try:
            _local.conn.close()
        except duckdb.Error as exc:
            logger.warning("Error closing DuckDB connection during reconnect: %s", exc)
        _local.conn = None
    _local.conn = _create_connection(path or settings.DUCKDB_PATH)
    return _local.conn


def _seed_demo_data(conn: duckdb.DuckDBPyConnection) -> None:
    """Seed demo tables so the UI has something to explore."""
    conn.execute("""
        CREATE SCHEMA IF NOT EXISTS demo;
        CREATE SCHEMA IF NOT EXISTS main;

        CREATE TABLE IF NOT EXISTS demo.orders (
            order_id    INTEGER,
            customer_id INTEGER,
            product     VARCHAR,
            amount      DOUBLE,
            status      VARCHAR,
            order_date  DATE
        );

        CREATE TABLE IF NOT EXISTS demo.customers (
            customer_id INTEGER,
            name        VARCHAR,
            country     VARCHAR,
            segment     VARCHAR
        );

        CREATE TABLE IF NOT EXISTS demo.products (
            product_id   INTEGER,
            product_name VARCHAR,
            category     VARCHAR,
            unit_price   DOUBLE,
            cost         DOUBLE,
            sku          VARCHAR
        );

        CREATE TABLE IF NOT EXISTS demo.returns (
            return_id   INTEGER,
            order_id    INTEGER,
            reason      VARCHAR,
            return_date DATE,
            refund_amt  DOUBLE
        );

        CREATE TABLE IF NOT EXISTS demo.campaigns (
            campaign_id   INTEGER,
            customer_id   INTEGER,
            channel       VARCHAR,
            campaign_date DATE,
            spend         DOUBLE,
            impressions   INTEGER
        );

        CREATE TABLE IF NOT EXISTS main.oracleebs_ap_invoices_all (
            invoice_id      INTEGER,
            vendor_id       INTEGER,
            invoice_num     VARCHAR,
            invoice_date    DATE,
            invoice_amount  DOUBLE,
            currency_code   VARCHAR,
            status          VARCHAR,
            org_id          INTEGER
        );

        CREATE TABLE IF NOT EXISTS main.oracleebs_gl_code_combinations (
            code_combination_id INTEGER,
            segment1            VARCHAR,
            segment2            VARCHAR,
            segment3            VARCHAR,
            account_type        VARCHAR,
            enabled_flag        VARCHAR
        );

        CREATE TABLE IF NOT EXISTS main.oracleebs_gl_je_headers (
            je_header_id    INTEGER,
            je_batch_id     INTEGER,
            name            VARCHAR,
            currency_code   VARCHAR,
            status          VARCHAR,
            posted_date     DATE,
            period_name     VARCHAR,
            je_source       VARCHAR
        );
    """)

    row_check = conn.execute("SELECT COUNT(*) FROM demo.orders").fetchone()[0]
    if row_check == 0:
        conn.execute("""
            INSERT INTO demo.orders VALUES
                (1,  101, 'Widget A',  29.99, 'shipped',   '2024-01-05'),
                (2,  102, 'Widget B',  49.99, 'pending',   '2024-01-06'),
                (3,  101, 'Gadget X',  99.99, 'delivered', '2024-01-07'),
                (4,  103, 'Widget A',  29.99, 'shipped',   '2024-01-08'),
                (5,  104, 'Gadget Y',  79.99, 'cancelled', '2024-01-09'),
                (6,  101, 'Pro Z',    149.99, 'shipped',   '2024-02-01'),
                (7,  105, 'Widget B',  49.99, 'delivered', '2024-02-03'),
                (8,  106, 'Gadget X',  99.99, 'shipped',   '2024-02-10'),
                (9,  102, 'Pro Z',    149.99, 'delivered', '2024-02-15'),
                (10, 107, 'Widget A',  29.99, 'pending',   '2024-03-01'),
                (11, 103, 'Gadget Y',  79.99, 'shipped',   '2024-03-05'),
                (12, 104, 'Pro Z',    149.99, 'cancelled', '2024-03-07'),
                (13, 108, 'Widget B',  49.99, 'delivered', '2024-03-12'),
                (14, 105, 'Gadget X',  99.99, 'shipped',   '2024-03-20'),
                (15, 101, 'Widget A',  29.99, 'delivered', '2024-04-01');

            INSERT INTO demo.customers VALUES
                (101, 'Alice',   'US', 'retail'),
                (102, 'Bob',     'UK', 'wholesale'),
                (103, 'Charlie', 'US', 'retail'),
                (104, 'Diana',   'CA', 'wholesale'),
                (105, 'Eve',     'AU', 'retail'),
                (106, 'Frank',   'DE', 'enterprise'),
                (107, 'Grace',   'US', 'retail'),
                (108, 'Hank',    'FR', 'wholesale');

            INSERT INTO demo.products VALUES
                (1, 'Widget A', 'Widgets',  29.99, 12.00, 'WGT-A-001'),
                (2, 'Widget B', 'Widgets',  49.99, 18.50, 'WGT-B-002'),
                (3, 'Gadget X', 'Gadgets',  99.99, 42.00, 'GDG-X-003'),
                (4, 'Gadget Y', 'Gadgets',  79.99, 35.00, 'GDG-Y-004'),
                (5, 'Pro Z',    'Pro',      149.99, 65.00, 'PRO-Z-005');

            INSERT INTO demo.returns VALUES
                (1, 5,  'defective',       '2024-01-15', 79.99),
                (2, 12, 'changed_mind',    '2024-03-14', 149.99),
                (3, 2,  'wrong_item',      '2024-01-20', 49.99);

            INSERT INTO demo.campaigns VALUES
                (1, 101, 'email',   '2024-01-01', 250.00,  15000),
                (2, 102, 'social',  '2024-01-15', 500.00,  42000),
                (3, 103, 'search',  '2024-02-01', 800.00,  90000),
                (4, 104, 'display', '2024-02-10', 320.00,  28000),
                (5, 105, 'email',   '2024-03-01', 150.00,   9500);

            INSERT INTO main.oracleebs_ap_invoices_all VALUES
                (1001, 501, 'INV-2024-001', '2024-01-10', 12500.00, 'USD', 'APPROVED', 101),
                (1002, 502, 'INV-2024-002', '2024-01-15', 8750.50,  'EUR', 'PAID',     101),
                (1003, 501, 'INV-2024-003', '2024-02-01', 4200.00,  'USD', 'APPROVED', 102),
                (1004, 503, 'INV-2024-004', '2024-02-20', 31000.00, 'GBP', 'PENDING',  101),
                (1005, 502, 'INV-2024-005', '2024-03-05', 9900.00,  'USD', 'PAID',     102);

            INSERT INTO main.oracleebs_gl_code_combinations VALUES
                (2001, '01', '5010', '000', 'E', 'Y'),
                (2002, '01', '5020', '000', 'E', 'Y'),
                (2003, '02', '4010', '000', 'R', 'Y'),
                (2004, '02', '4020', '100', 'R', 'Y'),
                (2005, '01', '6010', '000', 'E', 'N');

            INSERT INTO main.oracleebs_gl_je_headers VALUES
                (3001, 4001, 'Jan Accruals',  'USD', 'POSTED', '2024-01-31', '2024-01', 'Manual'),
                (3002, 4001, 'Feb Accruals',  'USD', 'POSTED', '2024-02-29', '2024-02', 'Manual'),
                (3003, 4002, 'AP Automation', 'EUR', 'POSTED', '2024-01-25', '2024-01', 'Payables'),
                (3004, 4003, 'Reclass Q1',    'USD', 'DRAFT',  '2024-03-31', '2024-03', 'Manual'),
                (3005, 4002, 'AP Automation', 'USD', 'POSTED', '2024-02-20', '2024-02', 'Payables');
        """)
