"""Orchestrator Agent: coordinates vision -> search -> location -> matching -> notification.

Flow is a straight pipeline (no agent-to-agent loops). Duplicate processing is prevented by
(1) a per-report `processed_at` guard, (2) the Search Agent excluding existing pairs, and
(3) a UNIQUE(lost_report_id, found_report_id) database constraint.
"""
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.agents.base import AgentRunner
from app.agents.location import LocationAgent, LocationIn
from app.agents.matching_agent import MatchIn, MatchingAgent
from app.agents.notification import NotificationAgent, NotifyIn
from app.agents.search import SearchAgent, SearchIn
from app.agents.vision import VisionAgent, VisionIn
from app.models import Match, Report


class RunSummary(BaseModel):
    run_id: str
    skipped: bool = False
    candidates: int = 0
    matches_created: int = 0


def _view(r: Report) -> dict:
    return dict(category=r.category, title=r.title, description=r.description, color=r.color, brand=r.brand,
                location_name=r.location_name, latitude=r.latitude, longitude=r.longitude,
                event_date=r.event_date, visual_features=r.visual_features)


class Orchestrator:
    name = "orchestrator"

    def __init__(self, db):
        self.db = db

    def process_report(self, report_id: str, force: bool = False) -> RunSummary:
        run_id = uuid.uuid4().hex[:12]
        report = self.db.get(Report, report_id)
        if report is None or report.status != "open":
            return RunSummary(run_id=run_id, skipped=True)
        if report.processed_at is not None and not force:
            return RunSummary(run_id=run_id, skipped=True)
        runner = AgentRunner(self.db, run_id)

        vision = runner.call(VisionAgent(self.db), VisionIn(report_id=report.id))
        if vision and vision.features:
            report.visual_features = vision.features
            self.db.commit()

        found_ids = runner.call(SearchAgent(self.db), SearchIn(report_id=report.id))
        candidates = found_ids.candidate_ids if found_ids else []
        created = 0
        for cid in candidates:
            other = self.db.get(Report, cid)
            if other is None:
                continue
            lost, found = (report, other) if report.kind == "lost" else (other, report)
            loc = runner.call(LocationAgent(self.db), LocationIn(
                a_lat=lost.latitude, a_lng=lost.longitude, a_name=lost.location_name,
                b_lat=found.latitude, b_lng=found.longitude, b_name=found.location_name))
            res = runner.call(MatchingAgent(self.db), MatchIn(
                lost=_view(lost), found=_view(found),
                location_score=loc.score if loc else None, location_provided=loc is not None))
            if res is None or not res.plausible or res.score is None:
                continue
            m = Match(lost_report_id=lost.id, found_report_id=found.id, score=res.score,
                      breakdown=res.breakdown, reasons=res.reasons)
            self.db.add(m)
            try:
                self.db.commit()
            except IntegrityError:  # another request created the same pair first
                self.db.rollback()
                continue
            created += 1
            notifier = NotificationAgent(self.db)
            runner.call(notifier, NotifyIn(user_id=lost.user_id, type="new_match", title="Possible match for your lost item",
                                           body=f"'{lost.title}' may match a found item ({res.score:.0f}% match). This is a lead, not proof.",
                                           link=f"/matches/{m.id}"))
            runner.call(notifier, NotifyIn(user_id=found.user_id, type="new_match", title="A lost report may match your found item",
                                           body=f"Someone may be looking for '{found.title}'.", link=f"/matches/{m.id}"))
        report.processed_at = datetime.now(timezone.utc)
        self.db.commit()
        return RunSummary(run_id=run_id, candidates=len(candidates), matches_created=created)
