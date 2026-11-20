import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.update({
    "APP_ENV": "test", "AUTH_MODE": "local", "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", "sqlite:///:memory:"), "STORAGE_BACKEND": "local",
    "LOCAL_STORAGE_DIR": _tmp, "RATE_LIMIT_ENABLED": "false", "ADMIN_EMAILS": "boss@example.com",
    "SUPABASE_JWT_SECRET": "test-secret-test-secret-test-secret-1234"})

import io  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import reset_rate_limits  # noqa: E402
from app.main import app, seed  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    reset_rate_limits()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class User:
    def __init__(self, client, email, name="Test"):
        r = client.post("/api/auth/dev/signup", json={"email": email, "password": "password123", "full_name": name})
        assert r.status_code == 200, r.text
        self.token, self.id, self.email = r.json()["access_token"], r.json()["user"]["id"], email
        self.h = {"Authorization": f"Bearer {self.token}"}


@pytest.fixture
def make_user(client):
    return lambda email, name="Test": User(client, email, name)


def png_bytes(color=(200, 30, 30), size=(64, 64), fmt="PNG"):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


def make_report(client, user, kind, **over):
    body = dict(kind=kind, title="Black Dell laptop", category="electronics", description="Black Dell laptop with a sticker on the lid",
                color="black", brand="Dell", location_name="Library", latitude=12.8625, longitude=77.4375,
                event_date="2026-11-10T10:00:00Z")
    body.update(over)
    r = client.post("/api/reports", json=body, headers=user.h)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    if body.pop("with_image", True):
        up = client.post(f"/api/reports/{rid}/images", files={"file": ("a.png", png_bytes(), "image/png")}, headers=user.h)
        assert up.status_code == 201, up.text
    s = client.post(f"/api/reports/{rid}/submit", headers=user.h)
    assert s.status_code == 200, s.text
    return s.json()
