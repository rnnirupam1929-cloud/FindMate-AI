#!/usr/bin/env python3
"""Checks a real Supabase setup end to end. NOT run in the original build (needs your credentials).

Needs: SUPABASE_URL, VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY, and a running
backend with AUTH_MODE=supabase STORAGE_BACKEND=supabase at BACKEND_URL (default http://127.0.0.1:8000).
Email confirmation must be OFF in a throwaway project, or set TEST_EMAIL/TEST_PASSWORD of an already confirmed user.

    python scripts/verify_supabase.py
"""
import io
import os
import sys
import time
import uuid

import httpx

URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY") or os.environ["VITE_SUPABASE_ANON_KEY"]
BACKEND = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail and not ok else ""))


def main() -> int:
    c = httpx.Client(timeout=30)
    h = c.get(f"{BACKEND}/api/health").json()
    check("backend is in supabase mode", h.get("auth_mode") == "supabase" and h.get("storage") == "supabase", str(h))

    email = os.environ.get("TEST_EMAIL") or f"verify-{uuid.uuid4().hex[:8]}@example.com"
    pw = os.environ.get("TEST_PASSWORD") or "Passw0rd!verify"
    if not os.environ.get("TEST_EMAIL"):
        r = c.post(f"{URL}/auth/v1/signup", headers={"apikey": ANON}, json={"email": email, "password": pw, "data": {"full_name": "Verify Bot"}})
        check("Supabase sign-up works", r.status_code == 200, r.text[:200])
    r = c.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON}, json={"email": email, "password": pw})
    check("sign-in returns a session (email confirmation off or user confirmed)", r.status_code == 200, r.text[:200])
    if r.status_code != 200:
        return report()
    tok = r.json()["access_token"]
    H = {"Authorization": f"Bearer {tok}"}

    me = c.get(f"{BACKEND}/api/me", headers=H)
    check("backend accepts the Supabase JWT", me.status_code == 200, me.text[:200])
    check("backend rejects a tampered JWT", c.get(f"{BACKEND}/api/me", headers={"Authorization": f"Bearer {tok}x"}).status_code == 401)

    rep = c.post(f"{BACKEND}/api/reports", headers=H, json={"kind": "lost", "title": "Verify bottle", "category": "water_bottles", "description": "temporary verification report"})
    check("report saved to Postgres", rep.status_code in (200, 201), rep.text[:200])
    rid = rep.json().get("id")
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGB", (64, 64), (10, 80, 200)).save(buf, "PNG")
    up = c.post(f"{BACKEND}/api/reports/{rid}/images", headers=H, files={"file": ("a.png", buf.getvalue(), "image/png")})
    check("image uploaded to Supabase Storage", up.status_code in (200, 201), up.text[:200])
    if up.status_code in (200, 201):
        signed = c.get(f"{BACKEND}/api/reports/{rid}", headers=H).json()["images"][0]["url"]
        check("signed URL serves the image", c.get(signed).status_code == 200)
        path = signed.split("/object/sign/")[-1].split("?")[0] if "/object/sign/" in signed else ""
        if path:
            check("bucket is private (unsigned public URL denied)", c.get(f"{URL}/storage/v1/object/public/{path}").status_code in (400, 401, 403, 404))
    # Row Level Security: the anon key alone must not read reports
    anon = c.get(f"{URL}/rest/v1/reports?select=id", headers={"apikey": ANON})
    check("RLS: anon key cannot read reports", anon.status_code in (401, 403) or anon.json() == [], anon.text[:120])
    other = c.get(f"{URL}/rest/v1/verification_answers?select=id", headers={"apikey": ANON, "Authorization": f"Bearer {tok}"})
    check("RLS: signed-in user cannot read other people's verification answers", other.status_code in (401, 403) or other.json() == [], other.text[:120])
    check("cleanup: report deleted", c.delete(f"{BACKEND}/api/reports/{rid}", headers=H).status_code in (200, 204))
    return report()


def report() -> int:
    bad = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
