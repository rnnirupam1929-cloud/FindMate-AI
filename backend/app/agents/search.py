"""Search Agent: finds candidate reports of the opposite kind within the same institution."""
from pydantic import BaseModel
from sqlalchemy import select

from app.agents.base import Agent
from app.models import Match, Report

MAX_CANDIDATES = 100


class SearchIn(BaseModel):
    report_id: str


class SearchOut(BaseModel):
    candidate_ids: list[str] = []


class SearchAgent(Agent[SearchIn, SearchOut]):
    name = "search"
    input_model, output_model = SearchIn, SearchOut

    def run(self, data: SearchIn) -> SearchOut:
        r = self.db.get(Report, data.report_id)
        if r is None:
            return SearchOut()
        opposite = "found" if r.kind == "lost" else "lost"
        q = select(Report.id).where(Report.kind == opposite, Report.status == "open", Report.is_hidden.is_(False),
                                    Report.institution_id == r.institution_id, Report.user_id != r.user_id)
        ids = list(self.db.scalars(q.order_by(Report.created_at.desc()).limit(MAX_CANDIDATES)))
        col_self, col_other = (Match.lost_report_id, Match.found_report_id) if r.kind == "lost" else (Match.found_report_id, Match.lost_report_id)
        existing = set(self.db.scalars(select(col_other).where(col_self == r.id)))  # never re-process an existing pair
        return SearchOut(candidate_ids=[i for i in ids if i not in existing])
