"""Location Agent: scores geographical relevance between two reports."""
from pydantic import BaseModel

from app.agents.base import Agent
from app.services.matching import ReportView, haversine_m, location_similarity


class LocationIn(BaseModel):
    a_lat: float | None = None
    a_lng: float | None = None
    a_name: str | None = None
    b_lat: float | None = None
    b_lng: float | None = None
    b_name: str | None = None


class LocationOut(BaseModel):
    score: float | None = None
    distance_m: float | None = None


class LocationAgent(Agent[LocationIn, LocationOut]):
    name = "location"
    input_model, output_model = LocationIn, LocationOut

    def run(self, d: LocationIn) -> LocationOut:
        a = ReportView(latitude=d.a_lat, longitude=d.a_lng, location_name=d.a_name)
        b = ReportView(latitude=d.b_lat, longitude=d.b_lng, location_name=d.b_name)
        dist = None
        if None not in (d.a_lat, d.a_lng, d.b_lat, d.b_lng):
            dist = round(haversine_m(d.a_lat, d.a_lng, d.b_lat, d.b_lng))
        return LocationOut(score=location_similarity(a, b), distance_m=dist)
