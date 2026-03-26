import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import settings
from app.db.auth_db import get_auth_conn
from app.models.schemas import LoginRequest, TokenResponse
from app.services import user_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# --- RBAC roles (lowest → highest privilege) ---
ROLES = ["viewer", "analyst", "admin"]


def _role_rank(role: str) -> int:
    return ROLES.index(role) if role in ROLES else -1


def require_role(minimum: str):
    """Dependency factory: raises 403 if user's role is below minimum."""
    async def check(current: dict = Depends(get_current_user)):
        if _role_rank(current["role"]) < _role_rank(minimum):
            raise HTTPException(status_code=403, detail=f"Requires role: {minimum}")
        return current
    return check


# --- Token creation ---

def create_access_token(user: dict) -> tuple[str, str]:
    """Returns (token, jti)."""
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": user["username"],
        "uid": user["id"],
        "role": user["role"],
        "jti": jti,
        "exp": expire,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, jti


def _store_session(user_id: int, jti: str, expires_at: datetime, ip: str, ua: str) -> None:
    conn = get_auth_conn()
    conn.execute(
        """INSERT INTO sessions (user_id, jti, ip_address, user_agent, expires_at)
           VALUES (?,?,?,?,?)""",
        (user_id, jti, ip, ua, expires_at.isoformat()),
    )
    conn.commit()


def _revoke_session(jti: str) -> None:
    conn = get_auth_conn()
    conn.execute("UPDATE sessions SET is_revoked = 1 WHERE jti = ?", (jti,))
    conn.commit()


def _is_session_valid(jti: str) -> bool:
    row = get_auth_conn().execute(
        "SELECT is_revoked FROM sessions WHERE jti = ?", (jti,)
    ).fetchone()
    if row is None:
        return False
    return row["is_revoked"] == 0


# --- Login / Logout ---

def login(req: LoginRequest, ip: str = "", ua: str = "") -> TokenResponse:
    user = user_service.get_user_by_username(req.username)
    if not user or not user_service.verify_password(req.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token, jti = create_access_token(user)
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    _store_session(user["id"], jti, expire, ip, ua)
    return TokenResponse(
        access_token=token,
        username=user["username"],
        role=user["role"],
    )


def logout(jti: str) -> None:
    _revoke_session(jti)


# --- get_current_user dependency ---

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_exc
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("uid")
        role: str = payload.get("role", "viewer")
        jti: str = payload.get("jti")
        if not username or not jti:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    if not _is_session_valid(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"username": username, "id": user_id, "role": role, "jti": jti}
