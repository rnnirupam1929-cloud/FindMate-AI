"""Learning Agent: turns real outcomes into a *proposal* for better matching weights.

Nothing changes automatically. The agent records outcomes (confirmed / dismissed / claim approved or rejected)
with the per-signal scores. An administrator can look at `propose()` and press Apply; only then do new weights
affect future matches. Old matches keep the score they were created with. Reset returns to the defaults.
"""
from sqlalchemy import select

from app.models import ActivityLog, Match
from app.services.matching import DEFAULT_WEIGHTS

POSITIVE = {"confirmed", "claim_approved"}
NEGATIVE = {"dismissed", "claim_rejected"}
MIN_PER_CLASS = 15         # total examples needed of each outcome before any proposal
MIN_PER_SIGNAL = 10        # examples per class where that signal was available
MAX_SHIFT = 0.30           # a weight may move at most +/-30% from its default


class LearningAgent:
    name = "learning"

    def __init__(self, db):
        self.db = db

    def record(self, match: Match, outcome: str, user_id: str | None):
        self.db.add(ActivityLog(user_id=user_id, action="match_feedback", entity_type="match", entity_id=match.id,
                                meta={"outcome": outcome, "score": match.score, "breakdown": match.breakdown}))
        self.db.commit()

    def _rows(self):
        return self.db.scalars(select(ActivityLog).where(ActivityLog.action == "match_feedback")).all()

    def summary(self) -> dict:
        out: dict[str, dict] = {}
        for r in self._rows():
            o = (r.meta or {}).get("outcome", "unknown")
            d = out.setdefault(o, {"count": 0, "avg_score": 0.0})
            d["count"] += 1
            d["avg_score"] += (r.meta or {}).get("score", 0) or 0
        for d in out.values():
            d["avg_score"] = round(d["avg_score"] / d["count"], 1)
        return out

    def propose(self) -> dict:
        pos: dict[str, list[float]] = {k: [] for k in DEFAULT_WEIGHTS}
        neg: dict[str, list[float]] = {k: [] for k in DEFAULT_WEIGHTS}
        n_pos = n_neg = 0
        for r in self._rows():
            m = r.meta or {}
            o = m.get("outcome")
            bucket = pos if o in POSITIVE else neg if o in NEGATIVE else None
            if bucket is None:
                continue
            n_pos += bucket is pos
            n_neg += bucket is neg
            for k, v in (m.get("breakdown") or {}).items():
                if k in bucket and isinstance(v, (int, float)):
                    bucket[k].append(float(v))
        base = {"status": "insufficient_data", "positive_examples": n_pos, "negative_examples": n_neg,
                "needed_per_class": MIN_PER_CLASS, "current": active_weights(self.db), "defaults": DEFAULT_WEIGHTS, "proposal": None}
        if n_pos < MIN_PER_CLASS or n_neg < MIN_PER_CLASS:
            return base
        raw = {}
        for k, d in DEFAULT_WEIGHTS.items():
            if len(pos[k]) >= MIN_PER_SIGNAL and len(neg[k]) >= MIN_PER_SIGNAL:
                sep = sum(pos[k]) / len(pos[k]) - sum(neg[k]) / len(neg[k])  # how well this signal separates good from bad
                factor = min(1 + MAX_SHIFT, max(1 - MAX_SHIFT, 1 + 0.5 * sep))
            else:
                factor = 1.0
            raw[k] = d * factor
        total = sum(raw.values())
        base["proposal"] = {k: round(v / total, 4) for k, v in raw.items()}
        base["status"] = "ready"
        return base

    def apply(self, user_id: str) -> dict:
        p = self.propose()
        if p["status"] != "ready":
            raise ValueError("Not enough feedback to propose new weights yet.")
        self.db.add(ActivityLog(user_id=user_id, action="weights_applied", entity_type="settings", meta={"weights": p["proposal"]}))
        self.db.commit()
        return p["proposal"]

    def reset(self, user_id: str):
        self.db.add(ActivityLog(user_id=user_id, action="weights_reset", entity_type="settings", meta={}))
        self.db.commit()


def active_weights(db) -> dict[str, float]:
    """Latest admin-approved weights, or the defaults."""
    row = db.scalars(select(ActivityLog).where(ActivityLog.action.in_(("weights_applied", "weights_reset")))
                     .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(1)).first()
    w = (row.meta or {}).get("weights") if row and row.action == "weights_applied" else None
    if isinstance(w, dict) and set(w) == set(DEFAULT_WEIGHTS) and abs(sum(w.values()) - 1) < 0.01:
        return w
    return dict(DEFAULT_WEIGHTS)
