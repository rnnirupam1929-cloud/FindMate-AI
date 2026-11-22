from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from pydantic import ValidationError

from app.core import security
from app.core.config import Settings
from app.core.database import make_engine


def test_production_requires_persistent_database_and_remote_storage():
    with pytest.raises(ValidationError, match="persistent PostgreSQL"):
        Settings(
            app_env="production",
            auth_mode="supabase",
            database_url="sqlite:///./findmate.db",
            storage_backend="supabase",
            supabase_url="https://project.supabase.co",
            supabase_service_role_key="server-key",
        )


def test_production_allows_asymmetric_supabase_auth_without_legacy_secret():
    settings = Settings(
        app_env="production",
        auth_mode="supabase",
        database_url="postgresql+psycopg2://user:pass@db.example.com/postgres",
        storage_backend="supabase",
        supabase_url="https://project.supabase.co",
        supabase_service_role_key="server-key",
        supabase_jwt_secret="",
    )
    assert settings.supabase_jwt_secret == ""


def test_supabase_rs256_token_is_verified_with_project_jwks(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    issuer = "https://project.supabase.co/auth/v1"
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(
            auth_mode="supabase",
            supabase_url="https://project.supabase.co/",
            supabase_jwt_secret="",
        ),
    )
    monkeypatch.setattr(
        security,
        "_jwks_client",
        lambda requested_issuer: SimpleNamespace(
            get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=private_key.public_key())
        )
        if requested_issuer == issuer
        else None,
    )
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "iss": issuer,
            "aud": "authenticated",
            "sub": "user-id",
            "email": "user@example.com",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    assert security.decode_token(token)["sub"] == "user-id"


def test_supabase_jwks_network_failure_is_not_reported_as_invalid_credentials(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def fail_to_fetch(_token):
        raise jwt.PyJWKClientConnectionError("network unavailable")

    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(
            auth_mode="supabase",
            supabase_url="https://project.supabase.co",
            supabase_jwt_secret="",
        ),
    )
    monkeypatch.setattr(
        security,
        "_jwks_client",
        lambda _issuer: SimpleNamespace(get_signing_key_from_jwt=fail_to_fetch),
    )
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "iss": "https://project.supabase.co/auth/v1",
            "aud": "authenticated",
            "sub": "user-id",
            "email": "user@example.com",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    with pytest.raises(HTTPException) as exc:
        security.decode_token(token)
    assert exc.value.status_code == 503


def test_supabase_legacy_hs256_token_still_requires_correct_issuer(monkeypatch):
    issuer = "https://project.supabase.co/auth/v1"
    secret = "a-long-test-secret-value-with-more-than-thirty-two-bytes"
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(
            auth_mode="supabase",
            supabase_url="https://project.supabase.co",
            supabase_jwt_secret=secret,
        ),
    )
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "iss": "https://wrong-project.supabase.co/auth/v1",
            "aud": "authenticated",
            "sub": "user-id",
            "email": "user@example.com",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        secret,
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc:
        security.decode_token(token)
    assert exc.value.status_code == 401


def test_supabase_legacy_hs256_token_with_correct_issuer_is_accepted(monkeypatch):
    issuer = "https://project.supabase.co/auth/v1"
    secret = "a-long-test-secret-value-with-more-than-thirty-two-bytes"
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(
            auth_mode="supabase",
            supabase_url="https://project.supabase.co",
            supabase_jwt_secret=secret,
        ),
    )
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "iss": issuer,
            "aud": "authenticated",
            "sub": "user-id",
            "email": "user@example.com",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        secret,
        algorithm="HS256",
    )

    assert security.decode_token(token)["sub"] == "user-id"


def test_supabase_hs256_without_legacy_secret_fails_as_configuration_error(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(
            auth_mode="supabase",
            supabase_url="https://project.supabase.co",
            supabase_jwt_secret="local-dev-secret-change-me-32-bytes-min!!",
        ),
    )
    token = jwt.encode(
        {
            "iss": "https://project.supabase.co/auth/v1",
            "aud": "authenticated",
            "sub": "user-id",
            "email": "user@example.com",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        "local-dev-secret-change-me-32-bytes-min!!",
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc:
        security.decode_token(token)
    assert exc.value.status_code == 503


def test_vercel_postgres_pool_is_bounded(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    engine = make_engine("postgresql+psycopg2://user:pass@localhost/postgres")
    try:
        assert engine.pool.size() == 1
        assert engine.pool._max_overflow == 0
    finally:
        engine.dispose()
