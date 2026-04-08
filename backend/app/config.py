import logging
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-secret-key-replace-in-production-32chars"
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    SECRET_KEY: str = _DEV_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AUTH_DB_PATH: str = "./data/auth.db"
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    ENV: str = "development"

    # Dedicated encryption key for tokens stored in the DB (OAuth or PAT).
    # Must be a URL-safe base64-encoded 32-byte key (Fernet format).
    # In production this MUST be set explicitly — rotating it invalidates all stored tokens.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    FERNET_KEY: str = ""

    # OAuth redirect URI — must match what is registered in the Databricks workspace OAuth app.
    OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/connections/oauth/callback"

    # Frontend URL — used to redirect the browser after OAuth callback completes.
    FRONTEND_URL: str = "http://localhost:5173"

    # Databricks OAuth client_id — register once in your Databricks workspace under
    # Settings → Developer → App registrations, then paste the client_id here.
    # All user connections to that workspace will use this shared app registration.
    DATABRICKS_OAUTH_CLIENT_ID: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        if self.ENV == "production":
            if self.SECRET_KEY == _DEV_SECRET:
                raise ValueError(
                    "SECRET_KEY must be set to a strong random value in production."
                )
            if not self.FERNET_KEY:
                raise ValueError(
                    "FERNET_KEY must be set in production. "
                    "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                )
        elif not self.FERNET_KEY:
            # Dev fallback: derive a key from SECRET_KEY so dev works without config.
            # This is NOT safe for production (key rotation breaks token decryption).
            from cryptography.fernet import Fernet
            import base64, hashlib
            raw = hashlib.sha256(self.SECRET_KEY.encode()).digest()
            self.FERNET_KEY = base64.urlsafe_b64encode(raw).decode()
            logger.warning(
                "FERNET_KEY not set — using a key derived from SECRET_KEY. "
                "Set FERNET_KEY explicitly in production."
            )
        return self

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
