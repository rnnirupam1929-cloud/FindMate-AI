"""Learning Agent: collects feedback signals for future tuning.

It records outcomes (dismissed / confirmed) with the score breakdown. It does NOT change the live
weights automatically; a human reviews `summary()` and updates DEFAULT_WEIGHTS deliberately.
"""
from sqlalchemy import select

from app.models import ActivityLog, Match


class LearningAgent:
    name = "learning"

    def __init__(self, db):
        self.db = db

    def record(self, match: Match, outcome: str, user_id: str | None):
        self.db.add(ActivityLog(user_id=user_id, action="match_feedback", entity_type="match", entity_id=match.id,
                                meta={"outcome": outcome, "score": match.score, "breakdown": match.breakdown}))
        self.db.commit()

    def summary(self) -> dict:
        rows = self.db.scalars(select(ActivityLog).where(ActivityLog.action == "match_feedback")).all()
        out: dict[str, dict] = {}
        for r in rows:
            o = (r.meta or {}).get("outcome", "unknown")
            d = out.setdefault(o, {"count": 0, "avg_score": 0.0})
            d["count"] += 1
            d["avg_score"] += (r.meta or {}).get("score", 0) or 0
        for d in out.values():
            d["avg_score"] = round(d["avg_score"] / d["count"], 1)
        return out
