import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from jose import jwt, JWTError

from app.config import settings
from app.constants import AUDIT_SKIP_PATHS, FORWARDED_FOR_HEADER

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    """Logs every API request to the audit_log table after the response is sent."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        if request.url.path in AUDIT_SKIP_PATHS:
            return response

        # Resolve user from JWT (best-effort — never fail the response)
        user_id, username = None, None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                payload = jwt.decode(
                    auth_header[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
                )
                username = payload.get("sub")
                user_id = payload.get("uid")
            except JWTError:
                pass  # anonymous or invalid token — user_id/username stay None

        ip = request.headers.get(FORWARDED_FOR_HEADER, request.client.host if request.client else None)
        ua = request.headers.get("User-Agent")
        action = f"{request.method} {request.url.path}"

        try:
            from app.services.audit_service import log_activity
            log_activity(
                action=action,
                user_id=user_id,
                username=username,
                method=request.method,
                path=str(request.url.path),
                status_code=response.status_code,
                ip_address=ip,
                user_agent=ua,
                details=f"{elapsed_ms}ms",
            )
        except Exception:
            # Audit logging must never break an API response — log and continue.
            logger.exception("Audit logging failed for %s %s", request.method, request.url.path)

        return response
