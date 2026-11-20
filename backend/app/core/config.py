"""Application settings, loaded from environment variables (see .env.example)."""
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"  # local | test | production
    # "supabase": verify Supabase-issued JWTs. "local": built-in dev auth (never in production).
    auth_mode: str = "local"
    database_url: str = "sqlite:///./findmate.db"
    cors_origins: str = "http://localhost:5173"

    supabase_url: str = ""
    supabase_service_role_key: str = ""  # server-side only, never sent to the browser
    supabase_jwt_secret: str = "local-dev-secret-change-me-32-bytes-min!!"
    supabase_storage_bucket: str = "report-images"

    # Storage: "local" writes to disk, "supabase" uses a private Supabase bucket.
    storage_backend: str = "local"
    local_storage_dir: str = "./storage"
    signed_url_ttl_seconds: int = 600
    max_upload_bytes: int = 5 * 1024 * 1024

    admin_emails: str = ""  # comma separated; get the admin role on first sign-in
    match_threshold: float = 35.0
    agent_timeout_seconds: float = 10.0
    agent_max_retries: int = 1
    rate_limit_enabled: bool = True

    @model_validator(mode="after")
    def _guard(self):
        if self.app_env == "production" and self.auth_mode == "local":
            raise ValueError("AUTH_MODE=local is not allowed when APP_ENV=production")
        if self.app_env == "production" and self.supabase_jwt_secret.startswith("local-dev"):
            raise ValueError("Set SUPABASE_JWT_SECRET in production")
        return self

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
