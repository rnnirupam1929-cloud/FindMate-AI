from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import clean_text
from app.services.matching import CATEGORIES


def _utc(d: datetime | None):
    if d is not None and d.tzinfo is None:
        return d.replace(tzinfo=timezone.utc)
    return d


UTC = Annotated[datetime, AfterValidator(_utc)]
Category = Literal[tuple(CATEGORIES)]  # type: ignore[valid-type]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Auth / profile ----
class DevAuthIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=120)


class ProfileOut(ORM):
    id: str
    email: str
    full_name: str
    role: str
    institution_id: str | None
    created_at: UTC


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    institution_id: str | None = None

    @field_validator("full_name")
    @classmethod
    def _clean(cls, v):
        return clean_text(v)


class InstitutionIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    city: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    is_active: bool = True


class InstitutionOut(ORM, InstitutionIn):
    id: str


# ---- Reports ----
class ReportIn(BaseModel):
    kind: Literal["lost", "found"]
    title: str = Field(default="", max_length=160)
    category: Category = "other"
    description: str = Field(default="", max_length=2000)
    color: str | None = Field(default=None, max_length=40)
    brand: str | None = Field(default=None, max_length=80)
    location_name: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    event_date: UTC | None = None
    approx_time: str | None = Field(default=None, max_length=40)
    additional_details: str | None = Field(default=None, max_length=2000)
    private_clues: str | None = Field(default=None, max_length=2000)
    verification_questions: list[Annotated[str, Field(max_length=300)]] | None = Field(default=None, max_length=5)

    @field_validator("title", "description", "color", "brand", "location_name", "approx_time",
                     "additional_details", "private_clues")
    @classmethod
    def _clean(cls, v):
        return clean_text(v)

    @field_validator("verification_questions")
    @classmethod
    def _clean_list(cls, v):
        return [clean_text(q) for q in v if clean_text(q)] if v else v


class ReportPatch(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    category: Category | None = None
    description: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, max_length=40)
    brand: str | None = Field(default=None, max_length=80)
    location_name: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    event_date: UTC | None = None
    approx_time: str | None = Field(default=None, max_length=40)
    additional_details: str | None = Field(default=None, max_length=2000)
    private_clues: str | None = Field(default=None, max_length=2000)
    verification_questions: list[Annotated[str, Field(max_length=300)]] | None = Field(default=None, max_length=5)

    @field_validator("title", "description", "color", "brand", "location_name", "approx_time",
                     "additional_details", "private_clues")
    @classmethod
    def _clean(cls, v):
        return clean_text(v)


class StatusIn(BaseModel):
    status: Literal["open", "closed"]


class FlagIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)

    @field_validator("reason")
    @classmethod
    def _clean(cls, v):
        return clean_text(v)


class ImageOut(BaseModel):
    id: str
    url: str
    width: int | None = None
    height: int | None = None


class ReportOut(BaseModel):
    id: str
    kind: str
    title: str
    category: str
    description: str
    color: str | None
    brand: str | None
    location_name: str | None
    latitude: float | None
    longitude: float | None
    event_date: UTC | None
    approx_time: str | None
    additional_details: str | None
    status: str
    is_flagged: bool
    is_hidden: bool
    is_mine: bool
    created_at: UTC
    updated_at: UTC
    images: list[ImageOut] = []
    match_count: int = 0
    # Only populated for the owner and authorised reviewers:
    private_clues: str | None = None
    verification_questions: list[str] | None = None


class Page(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


# ---- Matches / verification ----
class MatchOut(BaseModel):
    id: str
    score: float
    breakdown: dict
    reasons: list[str]
    status: str
    created_at: UTC
    lost_report: ReportOut
    found_report: ReportOut
    my_side: Literal["lost", "found", "staff"]
    verification_id: str | None = None
    verification_status: str | None = None


class AnswerIn(BaseModel):
    question: str = Field(max_length=300)
    answer: str = Field(min_length=2, max_length=2000)

    @field_validator("answer")
    @classmethod
    def _clean(cls, v):
        return clean_text(v)


class AnswersIn(BaseModel):
    answers: list[AnswerIn] = Field(min_length=1, max_length=5)


class ReviewIn(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("note")
    @classmethod
    def _clean(cls, v):
        return clean_text(v)


class CompleteIn(BaseModel):
    handover_note: str | None = Field(default=None, max_length=1000)

    @field_validator("handover_note")
    @classmethod
    def _clean(cls, v):
        return clean_text(v)


class UserAdminPatch(BaseModel):
    role: Literal["student", "admin", "verification_agent"] | None = None
    is_suspended: bool | None = None


class ModerationPatch(BaseModel):
    is_hidden: bool | None = None
    is_flagged: bool | None = None
