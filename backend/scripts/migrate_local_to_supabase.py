"""Move the local SQLite dataset and image files into the configured Supabase project."""
from __future__ import annotations

import argparse
import hashlib
import os
import secrets
import sys
from pathlib import Path
from urllib.parse import quote

import httpx
from sqlalchemy import create_engine, func, insert, select
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import (
    ActivityLog,
    AgentLog,
    Institution,
    Match,
    Notification,
    Profile,
    Recovery,
    Report,
    ReportImage,
    VerificationAnswer,
    VerificationRequest,
)

APP_MODELS = (
    Profile,
    Report,
    ReportImage,
    Match,
    VerificationRequest,
    VerificationAnswer,
    Notification,
    ActivityLog,
    Recovery,
    AgentLog,
)


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set.")
    return value


def _request(
    client: httpx.Client,
    method: str,
    path: str,
    *,
    params: dict | None = None,
    json: dict | None = None,
    content: bytes | None = None,
    headers: dict | None = None,
) -> httpx.Response:
    try:
        response = client.request(
            method,
            path,
            params=params,
            json=json,
            content=content,
            headers=headers,
        )
    except httpx.RequestError as exc:
        raise RuntimeError("Could not reach the configured Supabase project.") from exc
    if response.is_error:
        raise RuntimeError(f"Supabase returned HTTP {response.status_code} for {method} {path}.")
    return response


def _get_supabase_users(client: httpx.Client) -> dict[str, str]:
    users: dict[str, str] = {}
    page = 1
    while True:
        response = _request(
            client,
            "GET",
            "admin/users",
            params={"page": page, "per_page": 100},
        )
        entries = response.json().get("users", [])
        if not entries:
            break
        for user in entries:
            email = user.get("email")
            user_id = user.get("id")
            if email and user_id:
                users[email.strip().lower()] = user_id
        if len(entries) < 100:
            break
        page += 1
    return users


def _ensure_auth_users(
    client: httpx.Client,
    profiles: list[dict],
) -> dict[str, str]:
    by_email = _get_supabase_users(client)
    profile_ids: dict[str, str] = {}
    for profile in profiles:
        email = profile["email"].strip().lower()
        user_id = by_email.get(email)
        if user_id:
            _request(
                client,
                "PUT",
                f"admin/users/{quote(user_id, safe='')}",
                json={"email_confirm": True},
            )
        else:
            response = _request(
                client,
                "POST",
                "admin/users",
                json={
                    "email": email,
                    "password": secrets.token_urlsafe(32),
                    "email_confirm": True,
                    "user_metadata": {"full_name": profile["full_name"]},
                },
            )
            user_id = response.json().get("id")
            if not user_id:
                raise RuntimeError("Supabase did not return an ID for a migrated account.")
            by_email[email] = user_id
        profile_ids[profile["id"]] = user_id
    return profile_ids


def _send_password_resets(
    client: httpx.Client,
    profiles: list[dict],
    app_url: str,
    anon_key: str,
) -> int:
    failures = 0
    for profile in profiles:
        try:
            _request(
                client,
                "POST",
                "recover",
                params={"redirect_to": f"{app_url}/reset-password"},
                json={"email": profile["email"].strip().lower()},
                headers={
                    "apikey": anon_key,
                    "Authorization": f"Bearer {anon_key}",
                },
            )
        except RuntimeError:
            failures += 1
    return failures


def _row_values(row) -> dict:
    return {column.key: getattr(row, column.key) for column in row.__table__.columns}


def _source_image_path(root: Path, key: str) -> Path:
    resolved_root = root.resolve()
    resolved_path = (resolved_root / key).resolve()
    if resolved_root not in resolved_path.parents:
        raise RuntimeError(f"Image path is outside SOURCE_STORAGE_DIR: {key}")
    if not resolved_path.is_file():
        raise FileNotFoundError(f"Stored report image is missing: {key}")
    return resolved_path


def _read_source_data(source_engine, storage_root: Path) -> tuple[list[dict], dict[type, list[dict]], list[tuple[dict, Path]]]:
    with Session(source_engine) as source:
        institutions = [_row_values(row) for row in source.scalars(select(Institution)).all()]
        data = {
            model: [_row_values(row) for row in source.scalars(select(model)).all()]
            for model in APP_MODELS
        }

    images = [
        (row, _source_image_path(storage_root, row["storage_path"]))
        for row in data[ReportImage]
    ]
    for row, path in images:
        if hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
            raise RuntimeError(f"Stored report image failed its SHA-256 check: {row['storage_path']}")
    return institutions, data, images


def _check_destination(target_engine) -> None:
    with target_engine.connect() as connection:
        populated = [
            model.__tablename__
            for model in APP_MODELS
            if connection.scalar(select(func.count()).select_from(model.__table__)) > 0
        ]
    if populated:
        raise RuntimeError(
            "Destination application tables are not empty: "
            + ", ".join(populated)
            + ". Stop and reconcile existing production data before importing."
        )


def _migrate_rows(
    target_engine,
    institutions: list[dict],
    data: dict[type, list[dict]],
    auth_ids: dict[str, str],
) -> dict[str, int]:
    counts: dict[str, int] = {}

    def profile_id(source_id: str | None) -> str | None:
        if source_id is None:
            return None
        try:
            return auth_ids[source_id]
        except KeyError as exc:
            raise RuntimeError("A local record refers to a profile that was not migrated.") from exc

    with target_engine.begin() as target:
        target_institutions = {
            slug: institution_id
            for institution_id, slug in target.execute(select(Institution.id, Institution.slug))
        }
        source_institution_ids: dict[str, str] = {}
        for row in institutions:
            institution_id = target_institutions.get(row["slug"])
            if institution_id is None:
                collision = target.scalar(
                    select(Institution.id).where(Institution.id == row["id"])
                )
                if collision:
                    raise RuntimeError(
                        f"Destination institution ID conflicts with local institution {row['slug']}."
                    )
                target.execute(insert(Institution).values(row))
                institution_id = row["id"]
                target_institutions[row["slug"]] = institution_id
            source_institution_ids[row["id"]] = institution_id

        profile_rows = []
        for row in data[Profile]:
            migrated = dict(row)
            migrated["id"] = profile_id(row["id"])
            migrated["email"] = row["email"].strip().lower()
            if row["institution_id"]:
                migrated["institution_id"] = source_institution_ids[row["institution_id"]]
            profile_rows.append(migrated)

        rows_by_model = {Profile: profile_rows}
        for model in APP_MODELS[1:]:
            migrated_rows = []
            for row in data[model]:
                migrated = dict(row)
                if model is Report:
                    migrated["user_id"] = profile_id(row["user_id"])
                    if row["institution_id"]:
                        migrated["institution_id"] = source_institution_ids[row["institution_id"]]
                elif model is VerificationRequest:
                    migrated["claimant_id"] = profile_id(row["claimant_id"])
                    migrated["reviewer_id"] = profile_id(row["reviewer_id"])
                elif model is Notification:
                    migrated["user_id"] = profile_id(row["user_id"])
                elif model is ActivityLog:
                    migrated["user_id"] = profile_id(row["user_id"])
                elif model is Recovery and row["institution_id"]:
                    migrated["institution_id"] = source_institution_ids[row["institution_id"]]
                migrated_rows.append(migrated)
            rows_by_model[model] = migrated_rows

        for model in APP_MODELS:
            rows = rows_by_model[model]
            if rows:
                target.execute(insert(model), rows)
            counts[model.__tablename__] = len(rows)
    return counts


def migrate() -> None:
    source_url = os.getenv("SOURCE_DATABASE_URL", "sqlite:///./findmate.db")
    target_url = _required_env("DATABASE_URL")
    if not target_url.startswith(("postgresql://", "postgresql+psycopg2://")):
        raise RuntimeError("DATABASE_URL must point to the Supabase PostgreSQL database.")

    supabase_url = _required_env("SUPABASE_URL").rstrip("/")
    service_key = _required_env("SUPABASE_SERVICE_ROLE_KEY")
    anon_key = _required_env("SUPABASE_ANON_KEY")
    app_url = _required_env("PUBLIC_APP_URL").rstrip("/")
    storage_bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "report-images")
    storage_root = Path(os.getenv("SOURCE_STORAGE_DIR", "./storage"))

    source_engine = create_engine(source_url)
    target_engine = create_engine(target_url, pool_pre_ping=True)
    auth_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }

    try:
        _check_destination(target_engine)
        institutions, data, images = _read_source_data(source_engine, storage_root)
        profiles = data[Profile]
        if not profiles:
            raise RuntimeError("The local database contains no profiles to migrate.")

        with httpx.Client(
            base_url=f"{supabase_url}/auth/v1/",
            headers=auth_headers,
            timeout=20,
        ) as auth_client:
            auth_ids = _ensure_auth_users(auth_client, profiles)

        storage_headers = {
            **auth_headers,
            "x-upsert": "true",
        }
        uploaded = 0
        with httpx.Client(
            base_url=f"{supabase_url}/storage/v1/",
            headers=storage_headers,
            timeout=30,
        ) as storage_client:
            for row, path in images:
                _request(
                    storage_client,
                    "POST",
                    f"object/{quote(storage_bucket, safe='')}/{quote(row['storage_path'], safe='/')}",
                    content=path.read_bytes(),
                    headers={"Content-Type": row["mime_type"]},
                )
                uploaded += 1

        counts = _migrate_rows(target_engine, institutions, data, auth_ids)
        with httpx.Client(
            base_url=f"{supabase_url}/auth/v1/",
            headers=auth_headers,
            timeout=20,
        ) as auth_client:
            reset_failures = _send_password_resets(auth_client, profiles, app_url, anon_key)
    finally:
        source_engine.dispose()
        target_engine.dispose()

    print(f"Imported records: {counts}")
    print(f"Uploaded report images: {uploaded}")
    if reset_failures:
        print(
            f"Password-reset email requests failed for {reset_failures} account(s). "
            "Check Supabase Auth email delivery, then use the app's Forgot password flow."
        )
    else:
        print(f"Requested password-reset emails for {len(profiles)} migrated accounts.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="confirm that the destination project has the required migrations and is ready to import",
    )
    args = parser.parse_args()
    if not args.confirm:
        parser.error("This writes to Supabase and sends password-reset emails; pass --confirm to proceed.")
    migrate()


if __name__ == "__main__":
    main()
