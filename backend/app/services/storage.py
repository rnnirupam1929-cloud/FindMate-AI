"""Private image storage with validation, EXIF/GPS stripping and signed URLs."""
import hashlib
import hmac
import io
import os
import time
import uuid
from dataclasses import dataclass

import httpx
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings

ALLOWED = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_SIDE = 1600


@dataclass
class ProcessedImage:
    data: bytes
    mime: str
    width: int
    height: int
    sha256: str


def process_upload(raw: bytes) -> ProcessedImage:
    """Validate that bytes are a real JPEG/PNG/WebP, strip all metadata (incl. GPS), downscale."""
    s = get_settings()
    if len(raw) == 0:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(raw) > s.max_upload_bytes:
        raise HTTPException(413, f"Image is too large. Maximum size is {s.max_upload_bytes // (1024 * 1024)} MB.")
    try:
        img = Image.open(io.BytesIO(raw))
        fmt = img.format
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "Unsupported or corrupted image. Please upload a JPG, PNG or WebP file.")
    if fmt not in ALLOWED:
        raise HTTPException(400, "Unsupported image type. Please upload a JPG, PNG or WebP file.")
    img = ImageOps.exif_transpose(img)  # apply rotation before metadata is dropped
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    clean = Image.new(img.mode, img.size)  # fresh image: no EXIF, ICC or text chunks carried over
    clean.paste(img)
    out = io.BytesIO()
    clean.save(out, format=fmt, quality=88) if fmt != "PNG" else clean.save(out, format=fmt)
    data = out.getvalue()
    return ProcessedImage(data, ALLOWED[fmt], clean.width, clean.height, hashlib.sha256(data).hexdigest())


class LocalStorage:
    def __init__(self):
        self.root = os.path.abspath(get_settings().local_storage_dir)

    def _path(self, key: str) -> str:
        p = os.path.abspath(os.path.join(self.root, key))
        if not p.startswith(self.root + os.sep):
            raise HTTPException(400, "Invalid path.")
        return p

    def put(self, key: str, data: bytes, mime: str):
        p = self._path(key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(data)

    def read(self, key: str) -> bytes:
        with open(self._path(key), "rb") as f:
            return f.read()

    def delete(self, key: str):
        try:
            os.remove(self._path(key))
        except FileNotFoundError:
            pass

    def signed_url(self, key: str) -> str:
        return sign_local_url(key)


class SupabaseStorage:
    def __init__(self):
        s = get_settings()
        self.base = f"{s.supabase_url}/storage/v1"
        self.bucket = s.supabase_storage_bucket
        self.headers = {"Authorization": f"Bearer {s.supabase_service_role_key}", "apikey": s.supabase_service_role_key}

    def put(self, key: str, data: bytes, mime: str):
        r = httpx.post(f"{self.base}/object/{self.bucket}/{key}", content=data, timeout=20,
                       headers={**self.headers, "Content-Type": mime, "x-upsert": "true"})
        r.raise_for_status()

    def delete(self, key: str):
        httpx.request("DELETE", f"{self.base}/object/{self.bucket}", json={"prefixes": [key]}, headers=self.headers, timeout=20)

    def signed_url(self, key: str) -> str:
        r = httpx.post(f"{self.base}/object/sign/{self.bucket}/{key}", headers=self.headers, timeout=20,
                       json={"expiresIn": get_settings().signed_url_ttl_seconds})
        r.raise_for_status()
        return f"{get_settings().supabase_url}/storage/v1{r.json()['signedURL']}"


def sign_local_url(key: str) -> str:
    s = get_settings()
    exp = int(time.time()) + s.signed_url_ttl_seconds
    sig = hmac.new(s.supabase_jwt_secret.encode(), f"{key}:{exp}".encode(), hashlib.sha256).hexdigest()
    return f"/api/files/{key}?exp={exp}&sig={sig}"


def verify_local_signature(key: str, exp: int, sig: str) -> bool:
    s = get_settings()
    expected = hmac.new(s.supabase_jwt_secret.encode(), f"{key}:{exp}".encode(), hashlib.sha256).hexdigest()
    return exp >= time.time() and hmac.compare_digest(expected, sig)


def get_storage():
    return SupabaseStorage() if get_settings().storage_backend == "supabase" else LocalStorage()


def new_key(report_id: str, mime: str) -> str:
    return f"reports/{report_id}/{uuid.uuid4().hex}.{EXT[mime]}"
