import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from jose import jwt, JWTError

from app.config import settings


class AuditMiddleware(BaseHTTPMiddleware):
    """Logs every API request to the audit_log table after the response is sent."""

    # Paths to skip (health checks, docs)
    _SKIP = {"/api/health", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 1)

        if request.url.path in self._SKIP:
            return response

        # Resolve user from JWT (best-effort — don't fail the response)
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
                pass

        ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else None)
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
            pass  # Never let audit logging break the response

        return response
