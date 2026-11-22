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
    # Image embeddings: "none" = basic colour histogram (default), "openclip" = CLIP model (needs requirements-ai.txt
    # and a one-time weights download). If the model fails to load we fall back to the histogram and log a warning.
    embedding_backend: str = "none"
    openclip_model: str = "ViT-B-32"
    openclip_pretrained: str = "laion2b_s34b_b79k"
    match_threshold: float = 35.0
    agent_timeout_seconds: float = 10.0
    agent_max_retries: int = 1
    rate_limit_enabled: bool = True

    @model_validator(mode="after")
    def _guard(self):
        if self.auth_mode not in {"local", "supabase"}:
            raise ValueError("AUTH_MODE must be 'local' or 'supabase'")
        if self.storage_backend not in {"local", "supabase"}:
            raise ValueError("STORAGE_BACKEND must be 'local' or 'supabase'")
        if self.app_env == "production":
            if self.auth_mode != "supabase":
                raise ValueError("AUTH_MODE=supabase is required when APP_ENV=production")
            if not self.database_url.startswith(("postgresql://", "postgresql+psycopg2://")):
                raise ValueError("A persistent PostgreSQL DATABASE_URL is required in production")
            if self.storage_backend != "supabase":
                raise ValueError("STORAGE_BACKEND=supabase is required in production")
            if not self.supabase_url or not self.supabase_service_role_key:
                raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production")
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
