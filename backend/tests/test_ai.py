import math
from datetime import datetime, timezone

from app.agents.learning import LearningAgent, active_weights, MIN_PER_CLASS
from app.core.database import SessionLocal
from app.models import ActivityLog
from app.services.matching import DEFAULT_WEIGHTS, ReportView, description_similarity, score_pair, visual_similarity

D = datetime(2026, 11, 10, 10, tzinfo=timezone.utc)


def v(**kw):
    base = dict(category="bags", title="x", description="x", color=None, brand=None, location_name=None, latitude=None, longitude=None, event_date=D)
    base.update(kw)
    return ReportView(**base)


# ---- description matching
def test_synonyms_are_recognised():
    a = v(title="Backpack", description="black rucksack with steel water flask")
    b = v(title="Bag", description="black bag and a metal bottle")
    assert description_similarity(a, b) > 0.6


def test_small_spelling_differences_still_score():
    close = description_similarity(v(title="bottle", description="blue bottle"), v(title="bottel", description="blue bottel"))
    unrelated = description_similarity(v(title="bottle", description="blue bottle"), v(title="laptop", description="silver laptop charger"))
    assert close > 0.4 > unrelated


# ---- embeddings
def emb(vec):
    return {"kind": "embedding", "model": "openclip", "vector": vec}


def test_embedding_similarity_is_calibrated_and_bounded():
    same = visual_similarity(v(visual_features=emb([1, 0, 0])), v(visual_features=emb([1, 0, 0])))
    orth = visual_similarity(v(visual_features=emb([1, 0, 0])), v(visual_features=emb([0, 1, 0])))
    mid = visual_similarity(v(visual_features=emb([1, 0, 0])), v(visual_features=emb([0.6, 0.8, 0])))  # cos 0.6: "unrelated" for CLIP
    assert same == 1.0 and orth == 0.0 and 0 <= mid < 0.2


def test_embedding_mismatches_do_not_invent_a_score():
    assert visual_similarity(v(visual_features=emb([1, 0])), v(visual_features=emb([1, 0, 0]))) is None
    assert visual_similarity(v(visual_features=emb([0, 0])), v(visual_features=emb([1, 0]))) is None
    hist = {"kind": "histogram", "histogram": [0.5, 0.5]}
    assert visual_similarity(v(visual_features=emb([1, 0])), v(visual_features=hist)) is None  # mixed kinds


def test_reason_names_clip_when_used():
    r = score_pair(v(visual_features=emb([1, 0, 0]), category="bags"), v(visual_features=emb([1, 0, 0]), category="bags"))
    assert any("OpenCLIP" in x for x in r.reasons)


def test_embedder_falls_back_when_model_unavailable(monkeypatch):
    from app.agents import embedders
    from app.core.config import get_settings
    embedders._load.cache_clear()
    monkeypatch.setattr(get_settings(), "embedding_backend", "openclip")
    assert embedders.load_embedder() is None  # package/weights not installed here: must not raise
    embedders._load.cache_clear()
    monkeypatch.setattr(get_settings(), "embedding_backend", "none")
    assert embedders.load_embedder() is None


# ---- learning agent
def feed(db, outcome, n, **bd):
    for _ in range(n):
        db.add(ActivityLog(user_id=None, action="match_feedback", entity_type="match", entity_id="m",
                           meta={"outcome": outcome, "score": 60, "breakdown": {**{k: 0.5 for k in DEFAULT_WEIGHTS}, **bd}}))
    db.commit()


def test_no_proposal_without_enough_feedback():
    with SessionLocal() as db:
        feed(db, "confirmed", MIN_PER_CLASS - 1, category=1.0)
        feed(db, "dismissed", MIN_PER_CLASS, category=0.0)
        p = LearningAgent(db).propose()
        assert p["status"] == "insufficient_data" and p["proposal"] is None
        assert active_weights(db) == DEFAULT_WEIGHTS


def test_proposal_is_bounded_normalised_and_needs_human_apply():
    with SessionLocal() as db:
        feed(db, "confirmed", 20, category=1.0, location=0.9)   # category separates good from bad
        feed(db, "dismissed", 20, category=0.0, location=0.9)   # location does not
        feed(db, "flagged", 50, category=0.0)                   # flagged is ignored
        agent = LearningAgent(db)
        p = agent.propose()
        assert p["status"] == "ready"
        w = p["proposal"]
        assert math.isclose(sum(w.values()), 1, abs_tol=1e-3)
        assert w["category"] > DEFAULT_WEIGHTS["category"] and w["location"] < w["category"] * 1.5
        assert all(0.6 * DEFAULT_WEIGHTS[k] <= w[k] <= 1.5 * DEFAULT_WEIGHTS[k] for k in w)  # bounded shift (after normalising)
        assert active_weights(db) == DEFAULT_WEIGHTS               # proposing changes nothing
        agent.apply(None)
        assert active_weights(db) == w
        agent.reset(None)
        assert active_weights(db) == DEFAULT_WEIGHTS


def test_learning_endpoints_are_admin_only(client, make_user):
    admin, student = make_user("boss@example.com"), make_user("s@example.com")
    for method, path in [("get", "/api/admin/learning"), ("post", "/api/admin/learning/apply"), ("post", "/api/admin/learning/reset")]:
        assert getattr(client, method)(path, headers=student.h).status_code == 403
        assert getattr(client, method)(path).status_code == 401
    assert client.get("/api/admin/learning", headers=admin.h).json()["status"] == "insufficient_data"
    assert client.post("/api/admin/learning/apply", headers=admin.h).status_code == 409  # nothing to apply yet
    assert client.post("/api/admin/learning/reset", headers=admin.h).status_code == 200
