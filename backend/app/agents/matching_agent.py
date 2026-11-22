"""Matching Agent: combines component scores into one explainable 0-100 score."""
from pydantic import BaseModel

from app.agents.base import Agent
from app.core.config import get_settings
from app.services.matching import ReportView, is_plausible, score_pair


class MatchIn(BaseModel):
    lost: dict
    found: dict
    location_score: float | None = None
    location_provided: bool = False
    weights: dict[str, float] | None = None  # active weights; None = defaults


class MatchOut(BaseModel):
    score: float | None = None
    plausible: bool = False
    breakdown: dict = {}
    reasons: list[str] = []


class MatchingAgent(Agent[MatchIn, MatchOut]):
    name = "matching"
    input_model, output_model = MatchIn, MatchOut

    def run(self, d: MatchIn) -> MatchOut:
        lost, found = ReportView(**d.lost), ReportView(**d.found)
        pre = {"location": d.location_score} if d.location_provided else None
        res = score_pair(lost, found, weights=d.weights, precomputed=pre)
        ok = is_plausible(res, lost, found, get_settings().match_threshold)
        return MatchOut(score=res.score, plausible=ok, breakdown=res.breakdown, reasons=res.reasons)
