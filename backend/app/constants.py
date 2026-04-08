"""Application-wide constants — no magic strings scattered through the codebase."""
from enum import Enum

# ── RBAC ─────────────────────────────────────────────────────────────────────

class Role(str, Enum):
    VIEWER  = "viewer"
    ANALYST = "analyst"
    ADMIN   = "admin"

ROLES_ORDERED: list[str] = [Role.VIEWER, Role.ANALYST, Role.ADMIN]


# ── HTTP headers ──────────────────────────────────────────────────────────────

FORWARDED_FOR_HEADER = "X-Forwarded-For"


# ── Audit middleware ──────────────────────────────────────────────────────────

# Paths excluded from audit logging (health checks, API docs)
AUDIT_SKIP_PATHS: frozenset[str] = frozenset({
    "/api/health",
    "/docs",
    "/openapi.json",
    "/redoc",
})


# ── Audit query limits ────────────────────────────────────────────────────────

AUDIT_MAX_LIMIT = 1_000
