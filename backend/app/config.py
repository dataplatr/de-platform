from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-secret-key-replace-in-production-32chars"


class Settings(BaseSettings):
    SECRET_KEY: str = _DEV_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    DUCKDB_PATH: str = "./data/lakeflow.duckdb"
    AUTH_DB_PATH: str = "./data/auth.db"
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    ENV: str = "development"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def _require_secret_in_production(self) -> "Settings":
        if self.ENV == "production" and self.SECRET_KEY == _DEV_SECRET:
            raise ValueError(
                "SECRET_KEY must be set to a strong random value in production. "
                "Set the SECRET_KEY environment variable."
            )
        return self

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
