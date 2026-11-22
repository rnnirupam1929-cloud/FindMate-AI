"""Authentication and role-based access control.

Production: verifies Supabase JWTs using the project's legacy secret or signing-key JWKS.
Local dev:  the same verification path, tokens minted by /api/auth/dev/* (AUTH_MODE=local only).
The user's role is always read from the `profiles` table, never from token claims the user can influence.
"""
import hashlib
import hmac
import os
import re
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models import Institution, Profile

bearer = HTTPBearer(auto_error=False)


@lru_cache(maxsize=8)
def _jwks_client(issuer: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(
        f"{issuer}/.well-known/jwks.json",
        cache_jwk_set=True,
        lifespan=600,
        timeout=5,
    )


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return salt.hex() + "$" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    salt_hex, _, digest_hex = stored.partition("$")
    candidate = hash_password(password, bytes.fromhex(salt_hex)).split("$")[1]
    return hmac.compare_digest(candidate, digest_hex)


def issue_dev_token(user_id: str, email: str, ttl_minutes: int = 60 * 24) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    claims = {"sub": user_id, "email": email, "aud": "authenticated", "iat": now,
              "exp": now + timedelta(minutes=ttl_minutes)}
    return jwt.encode(claims, s.supabase_jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    s = get_settings()
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if s.auth_mode == "supabase":
            if not s.supabase_url:
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Supabase authentication is not configured.")
            issuer = f"{s.supabase_url.rstrip('/')}/auth/v1"
            if algorithm == "HS256":
                if not s.supabase_jwt_secret or s.supabase_jwt_secret.startswith("local-dev"):
                    raise HTTPException(
                        status.HTTP_503_SERVICE_UNAVAILABLE,
                        "Set SUPABASE_JWT_SECRET for legacy HS256 tokens or use Supabase asymmetric signing keys.",
                    )
                key = s.supabase_jwt_secret
            elif algorithm in {"ES256", "RS256"}:
                key = _jwks_client(issuer).get_signing_key_from_jwt(token).key
            else:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token.")
            return jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience="authenticated",
                issuer=issuer,
            )
        if algorithm != "HS256":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token.")
        return jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not reach Supabase to verify the signing key.")
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token.")


def default_institution(db: Session) -> Institution | None:
    return db.scalars(select(Institution).where(Institution.is_active.is_(True)).order_by(Institution.created_at)).first()


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Profile:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated.")
    claims = decode_token(creds.credentials)
    user_id, email = claims.get("sub"), (claims.get("email") or "").lower()
    if not user_id or not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token.")
    profile = db.get(Profile, user_id)
    if profile is None:  # first sign-in with Supabase: provision the profile row
        meta = claims.get("user_metadata") or {}
        inst = default_institution(db)
        role = "admin" if email in get_settings().admin_email_set else "student"
        profile = Profile(id=user_id, email=email, full_name=str(meta.get("full_name", ""))[:120],
                          role=role, institution_id=inst.id if inst else None)
        db.add(profile)
        db.commit()
    if profile.is_suspended:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been suspended.")
    return profile


def require_roles(*roles: str):
    def dep(user: Profile = Depends(current_user)) -> Profile:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to do that.")
        return user
    return dep


require_admin = require_roles("admin")
require_staff = require_roles("admin", "verification_agent")

# ---- Input sanitisation ----------------------------------------------------
_TAG = re.compile(r"<[^>]*>")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(_CTRL.sub("", _TAG.sub("", value)).split()) if "\n" not in value else \
        "\n".join(" ".join(_CTRL.sub("", _TAG.sub("", line)).split()) for line in value.splitlines()).strip()


# ---- Rate limiting (in-memory sliding window; use Redis when scaling to many instances) ----
_hits: dict[str, list[float]] = {}


def rate_limit(name: str, limit: int, per_seconds: int):
    def dep(request: Request):
        if not get_settings().rate_limit_enabled:
            return
        ident = request.client.host if request.client else "anon"
        auth = request.headers.get("authorization", "")
        key = f"{name}:{ident}:{auth[-16:]}"
        now = time.monotonic()
        window = [t for t in _hits.get(key, []) if now - t < per_seconds]
        if len(window) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please slow down and try again shortly.")
        window.append(now)
        _hits[key] = window
    return dep


def reset_rate_limits():
    _hits.clear()
