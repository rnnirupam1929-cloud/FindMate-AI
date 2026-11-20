import io

import jwt
from PIL import Image

from app.core.security import reset_rate_limits
from tests.conftest import make_report, png_bytes


# ---- Auth ----
def test_signup_login_me_and_duplicate(client, make_user):
    u = make_user("a@example.com", "Asha")
    assert client.get("/api/me", headers=u.h).json()["email"] == "a@example.com"
    assert client.post("/api/auth/dev/signup", json={"email": "a@example.com", "password": "password123"}).status_code == 409
    assert client.post("/api/auth/dev/login", json={"email": "a@example.com", "password": "wrongpass1"}).status_code == 401
    ok = client.post("/api/auth/dev/login", json={"email": "a@example.com", "password": "password123"})
    assert ok.status_code == 200 and ok.json()["access_token"]


def test_requires_auth_and_rejects_bad_or_expired_tokens(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    expired = jwt.encode({"sub": "x", "email": "e@example.com", "aud": "authenticated", "exp": 1}, "test-secret-test-secret-test-secret-1234", algorithm="HS256")
    r = client.get("/api/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and "expired" in r.json()["detail"]


def test_token_signed_with_wrong_secret_is_rejected(client):
    forged = jwt.encode({"sub": "x", "email": "e@example.com", "aud": "authenticated"}, "attacker-secret-attacker-secret-1234", algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_supabase_style_token_provisions_profile(client):
    tok = jwt.encode({"sub": "6f1f4f0e-0000-4000-8000-000000000001", "email": "New@X.test", "aud": "authenticated",
                      "user_metadata": {"full_name": "Sup User"}, "role": "admin"}, "test-secret-test-secret-test-secret-1234", algorithm="HS256")
    r = client.get("/api/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200 and r.json()["role"] == "student"  # a "role" claim in the token is ignored


def test_admin_email_gets_admin_role(make_user):
    assert make_user("boss@example.com").id


def test_suspended_user_is_blocked(client, make_user):
    admin, u = make_user("boss@example.com"), make_user("s@example.com")
    assert client.patch(f"/api/admin/users/{u.id}", json={"is_suspended": True}, headers=admin.h).status_code == 200
    assert client.get("/api/me", headers=u.h).status_code == 403


# ---- Reports, drafts, uploads ----
def test_draft_save_then_submit_validation(client, make_user):
    u = make_user("a@example.com")
    r = client.post("/api/reports", json={"kind": "lost", "title": "Wa"}, headers=u.h)
    assert r.status_code == 201 and r.json()["status"] == "draft"
    s = client.post(f"/api/reports/{r.json()['id']}/submit", headers=u.h)
    assert s.status_code == 422 and "at least 3" in s.json()["detail"]


def test_future_date_rejected(client, make_user):
    u = make_user("a@example.com")
    r = client.post("/api/reports", json={"kind": "lost", "title": "Wallet", "description": "brown leather wallet",
                                          "location_name": "Library", "event_date": "2999-01-01T00:00:00Z"}, headers=u.h).json()
    assert client.post(f"/api/reports/{r['id']}/submit", headers=u.h).status_code == 422


def test_report_persists_and_is_listed(client, make_user):
    u = make_user("a@example.com")
    rep = make_report(client, u, "lost")
    lst = client.get("/api/reports?kind=lost", headers=u.h).json()
    assert lst["total"] == 1 and lst["items"][0]["id"] == rep["id"] and lst["items"][0]["images"][0]["url"]


def test_html_is_stripped_from_input(client, make_user):
    u = make_user("a@example.com")
    r = client.post("/api/reports", json={"kind": "lost", "title": "<script>alert(1)</script>Keys", "description": "x"}, headers=u.h)
    assert "<" not in r.json()["title"]


def test_unsupported_and_corrupt_uploads_rejected(client, make_user):
    u = make_user("a@example.com")
    rid = client.post("/api/reports", json={"kind": "lost", "title": "Keys"}, headers=u.h).json()["id"]
    for name, data, mime in [("a.exe", b"MZ\x90\x00binary", "application/octet-stream"), ("a.png", b"not really a png", "image/png"),
                             ("a.gif", _gif(), "image/gif"), ("e.png", b"", "image/png")]:
        r = client.post(f"/api/reports/{rid}/images", files={"file": (name, data, mime)}, headers=u.h)
        assert r.status_code in (400, 413), (name, r.status_code)


def _gif():
    b = io.BytesIO()
    Image.new("RGB", (4, 4)).save(b, format="GIF")
    return b.getvalue()


def test_oversize_upload_rejected(client, make_user):
    u = make_user("a@example.com")
    rid = client.post("/api/reports", json={"kind": "lost", "title": "Keys"}, headers=u.h).json()["id"]
    r = client.post(f"/api/reports/{rid}/images", files={"file": ("big.png", b"0" * (5 * 1024 * 1024 + 10), "image/png")}, headers=u.h)
    assert r.status_code == 413


def test_exif_gps_is_stripped(client, make_user):
    u = make_user("a@example.com")
    rid = client.post("/api/reports", json={"kind": "lost", "title": "Keys"}, headers=u.h).json()["id"]
    img = Image.new("RGB", (50, 50), (10, 200, 10))
    exif = Image.Exif()
    exif[0x8825] = {1: "N", 2: (12.0, 51.0, 30.0), 3: "E", 4: (77.0, 26.0, 15.0)}  # GPS IFD
    exif[0x010F] = "PhoneMaker"
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    assert Image.open(io.BytesIO(buf.getvalue())).getexif().get(0x010F) == "PhoneMaker"
    out = client.post(f"/api/reports/{rid}/images", files={"file": ("p.jpg", buf.getvalue(), "image/jpeg")}, headers=u.h).json()
    url = out["images"][0]["url"]
    stored = client.get(url).content
    saved = Image.open(io.BytesIO(stored))
    assert not saved.getexif() and b"PhoneMaker" not in stored


def test_image_url_requires_valid_signature(client, make_user):
    u = make_user("a@example.com")
    rep = make_report(client, u, "lost")
    url = rep["images"][0]["url"]
    assert client.get(url).status_code == 200
    assert client.get(url.split("sig=")[0] + "sig=deadbeef").status_code == 403
    assert client.get(url.replace("exp=", "exp=1")).status_code == 403


def test_delete_report_and_other_user_cannot(client, make_user):
    a, b = make_user("a@example.com"), make_user("b@example.com")
    rep = make_report(client, a, "lost")
    assert client.delete(f"/api/reports/{rep['id']}", headers=b.h).status_code == 404
    assert client.delete(f"/api/reports/{rep['id']}", headers=a.h).status_code == 204
    assert client.get("/api/reports", headers=a.h).json()["total"] == 0


def test_status_change_open_closed(client, make_user):
    a = make_user("a@example.com")
    rep = make_report(client, a, "lost")
    assert client.post(f"/api/reports/{rep['id']}/status", json={"status": "closed"}, headers=a.h).json()["status"] == "closed"
    assert client.post(f"/api/reports/{rep['id']}/status", json={"status": "bogus"}, headers=a.h).status_code == 422


# ---- Matching ----
def _pair(client, make_user):
    owner, finder = make_user("owner@example.com", "Owner"), make_user("finder@example.com", "Finder")
    lost = make_report(client, owner, "lost")
    found = make_report(client, finder, "found", title="Dell laptop found", description="Black Dell laptop, sticker on lid",
                        private_clues="Cracked bottom-left corner and a 'NOVA' sticker", verification_questions=["What sticker is on the lid?"])
    return owner, finder, lost, found


def test_matching_generates_explained_match_and_notifications(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    m = client.get("/api/matches", headers=owner.h).json()
    assert m["total"] == 1
    item = m["items"][0]
    assert 35 <= item["score"] <= 100 and item["reasons"] and item["breakdown"]["category"] == 1.0
    assert item["breakdown"]["visual"] is not None
    assert client.get("/api/matches", headers=finder.h).json()["total"] == 1
    assert client.get("/api/notifications", headers=owner.h).json()["unread"] >= 1


def test_no_duplicate_matches_when_reprocessed(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    client.post(f"/api/reports/{lost['id']}/status", json={"status": "closed"}, headers=owner.h)
    client.post(f"/api/reports/{lost['id']}/status", json={"status": "open"}, headers=owner.h)
    client.patch(f"/api/reports/{lost['id']}", json={"description": "Black Dell laptop with a sticker on the lid"}, headers=owner.h)
    assert client.get("/api/matches", headers=owner.h).json()["total"] == 1


def test_unrelated_items_do_not_match(client, make_user):
    a, b = make_user("a@example.com"), make_user("b@example.com")
    make_report(client, a, "lost")
    make_report(client, b, "found", title="Brass keys", category="keys", description="three brass keys on a red ring", color="gold",
                brand=None, location_name="Far hostel", latitude=12.95, longitude=77.6, with_image=False)
    assert client.get("/api/matches", headers=a.h).json()["total"] == 0


def test_own_reports_never_match_each_other(client, make_user):
    a = make_user("a@example.com")
    make_report(client, a, "lost")
    make_report(client, a, "found")
    assert client.get("/api/matches", headers=a.h).json()["total"] == 0


def test_works_without_images(client, make_user):
    a, b = make_user("a@example.com"), make_user("b@example.com")
    make_report(client, a, "lost", with_image=False)
    make_report(client, b, "found", with_image=False)
    m = client.get("/api/matches", headers=a.h).json()["items"][0]
    assert m["breakdown"]["visual"] is None and m["score"] > 35


def test_dismiss_and_flag(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    mid = client.get("/api/matches", headers=owner.h).json()["items"][0]["id"]
    assert client.post(f"/api/matches/{mid}/flag", json={"reason": "Looks like a scam"}, headers=owner.h).json()["status"] == "flagged"
    assert client.post(f"/api/matches/{mid}/dismiss", headers=owner.h).json()["status"] == "dismissed"
    assert client.get("/api/matches", headers=owner.h).json()["total"] == 0


# ---- Verification & privacy ----
def _start(client, owner, mid):
    r = client.post(f"/api/matches/{mid}/verify", headers=owner.h)
    assert r.status_code == 201, r.text
    return r.json()


def test_full_verification_flow_and_recovery(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    mid = client.get("/api/matches", headers=owner.h).json()["items"][0]["id"]
    v = _start(client, owner, mid)
    assert v["questions"] == ["What sticker is on the lid?"]
    vid = v["id"]
    # claimant cannot see private clues and cannot self-approve
    cv = client.get(f"/api/verifications/{vid}", headers=owner.h).json()
    assert cv["private_clues"] is None and cv["role"] == "claimant"
    assert client.post(f"/api/verifications/{vid}/review", json={"decision": "approved"}, headers=owner.h).status_code == 403
    assert client.post(f"/api/verifications/{vid}/review", json={"decision": "approved"}, headers=finder.h).status_code == 409  # no answers yet
    # answers must match a real question
    assert client.post(f"/api/verifications/{vid}/answers", json={"answers": [{"question": "made up", "answer": "x yz"}]}, headers=owner.h).status_code == 422
    ans = client.post(f"/api/verifications/{vid}/answers", json={"answers": [{"question": "What sticker is on the lid?", "answer": "A NOVA sticker"}]}, headers=owner.h)
    assert ans.status_code == 200 and ans.json()["status"] == "under_review"
    assert client.post(f"/api/verifications/{vid}/answers", json={"answers": [{"question": "What sticker is on the lid?", "answer": "again"}]}, headers=owner.h).status_code == 409
    fv = client.get(f"/api/verifications/{vid}", headers=finder.h).json()
    assert "NOVA" in fv["private_clues"] and fv["answers"][0]["answer"] == "A NOVA sticker"
    assert client.get("/api/notifications", headers=finder.h).json()["unread"] >= 2
    ap = client.post(f"/api/verifications/{vid}/review", json={"decision": "approved", "note": "Matches"}, headers=finder.h)
    assert ap.status_code == 200 and ap.json()["status"] == "approved" and ap.json()["guidance"]
    done = client.post(f"/api/verifications/{vid}/complete", json={"handover_note": "Met at library"}, headers=finder.h)
    assert done.json()["status"] == "completed"
    assert client.get(f"/api/reports/{lost['id']}", headers=owner.h).json()["status"] == "recovered"
    dash = client.get("/api/dashboard", headers=owner.h).json()
    assert len(dash["recoveries"]) == 1
    assert any(n["type"] == "recovery_completed" for n in client.get("/api/notifications", headers=owner.h).json()["items"])


def test_rejection_flow(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    mid = client.get("/api/matches", headers=owner.h).json()["items"][0]["id"]
    vid = _start(client, owner, mid)["id"]
    client.post(f"/api/verifications/{vid}/answers", json={"answers": [{"question": "What sticker is on the lid?", "answer": "Not sure"}]}, headers=owner.h)
    r = client.post(f"/api/verifications/{vid}/review", json={"decision": "rejected", "note": "No"}, headers=finder.h).json()
    assert r["status"] == "rejected"
    assert client.post(f"/api/verifications/{vid}/complete", json={}, headers=finder.h).status_code == 409
    assert client.get(f"/api/reports/{found['id']}", headers=finder.h).json()["status"] == "open"


def test_unrelated_user_cannot_access_verification_match_or_private_data(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    stranger = make_user("s@example.com")
    mid = client.get("/api/matches", headers=owner.h).json()["items"][0]["id"]
    vid = _start(client, owner, mid)["id"]
    client.post(f"/api/verifications/{vid}/answers", json={"answers": [{"question": "What sticker is on the lid?", "answer": "NOVA"}]}, headers=owner.h)
    assert client.get(f"/api/verifications/{vid}", headers=stranger.h).status_code == 404
    assert client.post(f"/api/verifications/{vid}/review", json={"decision": "approved"}, headers=stranger.h).status_code == 404
    assert client.get(f"/api/matches/{mid}", headers=stranger.h).status_code == 404
    assert client.get(f"/api/reports/{lost['id']}", headers=stranger.h).status_code == 404
    assert client.get(f"/api/reports/{found['id']}", headers=stranger.h).status_code == 404
    assert client.get("/api/verifications", headers=stranger.h).json()["total"] == 0


def test_only_loser_can_start_verification_and_only_once(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    mid = client.get("/api/matches", headers=owner.h).json()["items"][0]["id"]
    assert client.post(f"/api/matches/{mid}/verify", headers=finder.h).status_code == 403
    _start(client, owner, mid)
    assert client.post(f"/api/matches/{mid}/verify", headers=owner.h).status_code == 409


def test_found_report_private_clues_hidden_from_matched_other_party(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    r = client.get(f"/api/reports/{found['id']}", headers=owner.h).json()  # matched party can see the public part
    assert r["private_clues"] is None and r["verification_questions"] is None
    assert "NOVA" in client.get(f"/api/reports/{found['id']}", headers=finder.h).json()["private_clues"]
    assert "user_id" not in r and "email" not in str(r)


def test_cannot_edit_or_delete_report_in_verification(client, make_user):
    owner, finder, lost, found = _pair(client, make_user)
    mid = client.get("/api/matches", headers=owner.h).json()["items"][0]["id"]
    _start(client, owner, mid)
    assert client.delete(f"/api/reports/{lost['id']}", headers=owner.h).status_code == 409
    assert client.patch(f"/api/reports/{lost['id']}", json={"title": "Changed"}, headers=owner.h).status_code == 409


# ---- Notifications ----
def test_notifications_read_unread(client, make_user):
    owner, *_ = _pair(client, make_user)
    n = client.get("/api/notifications", headers=owner.h).json()
    assert n["unread"] >= 1
    nid = n["items"][0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=owner.h).status_code == 204
    assert client.get("/api/notifications?unread_only=true", headers=owner.h).json()["unread"] == n["unread"] - 1
    assert client.post("/api/notifications/read-all", headers=owner.h).status_code == 204
    assert client.get("/api/notifications", headers=owner.h).json()["unread"] == 0


def test_cannot_read_someone_elses_notification(client, make_user):
    owner, finder, *_ = _pair(client, make_user)
    nid = client.get("/api/notifications", headers=owner.h).json()["items"][0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=finder.h).status_code == 404


# ---- Permissions / admin ----
def test_normal_user_blocked_from_admin_routes(client, make_user):
    u = make_user("a@example.com")
    for path in ["/api/admin/stats", "/api/admin/users", "/api/admin/reports", "/api/admin/institutions"]:
        assert client.get(path, headers=u.h).status_code == 403, path
    assert client.patch("/api/admin/users/whatever", json={"role": "admin"}, headers=u.h).status_code == 403
    assert client.get("/api/admin/stats").status_code == 401


def test_admin_can_manage_users_reports_institutions(client, make_user):
    admin, u = make_user("boss@example.com"), make_user("a@example.com")
    assert client.patch(f"/api/admin/users/{u.id}", json={"role": "verification_agent"}, headers=admin.h).json()["role"] == "verification_agent"
    assert client.patch(f"/api/admin/users/{admin.id}", json={"role": "student"}, headers=admin.h).status_code == 400
    rep = make_report(client, make_user("c@example.com"), "lost")
    assert client.patch(f"/api/admin/reports/{rep['id']}", json={"is_hidden": True}, headers=admin.h).json()["is_hidden"] is True
    inst = client.post("/api/admin/institutions", json={"name": "Test Uni", "slug": "test-uni", "city": "Mysuru"}, headers=admin.h)
    assert inst.status_code == 201
    assert client.post("/api/admin/institutions", json={"name": "Test Uni", "slug": "test-uni"}, headers=admin.h).status_code == 409
    assert client.get("/api/admin/stats", headers=admin.h).json()["reports"] == 1


def test_hidden_report_is_not_matched(client, make_user):
    admin, a, b = make_user("boss@example.com"), make_user("a@example.com"), make_user("b@example.com")
    f = make_report(client, b, "found", with_image=False)
    client.patch(f"/api/admin/reports/{f['id']}", json={"is_hidden": True}, headers=admin.h)
    make_report(client, a, "lost", with_image=False)
    assert client.get("/api/matches", headers=a.h).json()["total"] == 0


def test_verification_agent_can_review_in_own_institution(client, make_user):
    admin = make_user("boss@example.com")
    owner, finder, lost, found = _pair(client, make_user)
    agent = make_user("agent@example.com")
    client.patch(f"/api/admin/users/{agent.id}", json={"role": "verification_agent"}, headers=admin.h)
    mid = client.get("/api/matches", headers=owner.h).json()["items"][0]["id"]
    vid = _start(client, owner, mid)["id"]
    client.post(f"/api/verifications/{vid}/answers", json={"answers": [{"question": "What sticker is on the lid?", "answer": "NOVA"}]}, headers=owner.h)
    assert client.get("/api/verifications", headers=agent.h).json()["total"] == 1
    assert client.post(f"/api/verifications/{vid}/review", json={"decision": "approved"}, headers=agent.h).json()["status"] == "approved"


# ---- Map / dashboard / misc ----
def test_map_points_are_approximate_and_anonymous(client, make_user):
    a, b = make_user("a@example.com"), make_user("b@example.com")
    make_report(client, a, "lost", latitude=12.862512345, longitude=77.437598765, with_image=False)
    pts = client.get("/api/map/points", headers=b.h).json()["points"]
    assert len(pts) == 1 and pts[0]["latitude"] == 12.863 and pts[0]["longitude"] == 77.438
    assert set(pts[0]) == {"id", "kind", "title", "category", "location_name", "latitude", "longitude", "mine"}


def test_dashboard_shows_real_values_only(client, make_user):
    a = make_user("a@example.com")
    d = client.get("/api/dashboard", headers=a.h).json()
    assert d["lost_count"] == 0 and d["suggested_matches"] == [] and d["recoveries"] == []
    make_report(client, a, "lost", with_image=False)
    assert client.get("/api/dashboard", headers=a.h).json()["lost_count"] == 1


def test_agent_logs_written_and_orchestrator_is_idempotent(client, make_user):
    from app.agents.orchestrator import Orchestrator
    from app.core.database import SessionLocal
    from app.models import AgentLog
    a, b = make_user("a@example.com"), make_user("b@example.com")
    lost = make_report(client, a, "lost")
    make_report(client, b, "found")
    with SessionLocal() as db:
        names = {x.agent for x in db.query(AgentLog).all()}
        assert {"vision", "search", "location", "matching", "notification"} <= names
        again = Orchestrator(db).process_report(lost["id"])
        assert again.skipped


def test_rate_limit_on_auth(client):
    from app.core.config import get_settings
    get_settings().rate_limit_enabled = True
    try:
        reset_rate_limits()
        codes = [client.post("/api/auth/dev/login", json={"email": "x@example.com", "password": "password123"}).status_code for _ in range(12)]
        assert 429 in codes
    finally:
        get_settings().rate_limit_enabled = False


def test_unavailable_agent_does_not_break_report_submission(client, make_user, monkeypatch):
    from app.agents import vision
    monkeypatch.setattr(vision.VisionAgent, "run", lambda self, d: (_ for _ in ()).throw(RuntimeError("model down")))
    a = make_user("a@example.com")
    rep = make_report(client, a, "lost")
    assert rep["status"] == "open"
    from app.core.database import SessionLocal
    from app.models import AgentLog
    with SessionLocal() as db:
        assert db.query(AgentLog).filter_by(agent="vision", status="error").count() >= 1


def test_health_and_openapi(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/openapi.json").status_code == 200
