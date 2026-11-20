"""SQLAlchemy models. Mirrors database/migrations/001_schema.sql."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String,
                        Text, UniqueConstraint, CheckConstraint, Uuid)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


UUID = Uuid(as_uuid=False)
TS = DateTime(timezone=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(TS, default=_now)
    updated_at: Mapped[datetime] = mapped_column(TS, default=_now, onupdate=_now)


class Institution(Base, TimestampMixin):
    __tablename__ = "institutions"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    city: Mapped[str | None] = mapped_column(String(100))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Profile(Base, TimestampMixin):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(UUID, primary_key=True)  # = auth.users.id in Supabase
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(30), default="student")
    institution_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("institutions.id"))
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    institution: Mapped[Institution | None] = relationship()
    __table_args__ = (CheckConstraint("role in ('student','admin','verification_agent')", name="ck_profile_role"),)


class DevCredential(Base):
    """Only used when AUTH_MODE=local. Supabase Auth replaces this in production."""
    __tablename__ = "dev_credentials"
    user_id: Mapped[str] = mapped_column(UUID, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(255))


class Report(Base, TimestampMixin):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    kind: Mapped[str] = mapped_column(String(10))
    user_id: Mapped[str] = mapped_column(UUID, ForeignKey("profiles.id"), index=True)
    institution_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("institutions.id"), index=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    category: Mapped[str] = mapped_column(String(40), default="other")
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str | None] = mapped_column(String(40))
    brand: Mapped[str | None] = mapped_column(String(80))
    location_name: Mapped[str | None] = mapped_column(String(200))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    event_date: Mapped[datetime | None] = mapped_column(TS)
    approx_time: Mapped[str | None] = mapped_column(String(40))
    additional_details: Mapped[str | None] = mapped_column(Text)
    # Found reports only: never serialised to anyone but the finder and reviewers.
    private_clues: Mapped[str | None] = mapped_column(Text)
    verification_questions: Mapped[list | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(String(300))
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    visual_features: Mapped[dict | None] = mapped_column(JSON)
    processed_at: Mapped[datetime | None] = mapped_column(TS)
    images: Mapped[list["ReportImage"]] = relationship(cascade="all, delete-orphan", order_by="ReportImage.created_at")
    __table_args__ = (
        CheckConstraint("kind in ('lost','found')", name="ck_report_kind"),
        CheckConstraint("status in ('draft','open','matched','recovered','closed')", name="ck_report_status"),
        Index("ix_reports_search", "institution_id", "kind", "status", "category"),
    )


class ReportImage(Base):
    __tablename__ = "report_images"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    report_id: Mapped[str] = mapped_column(UUID, ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    storage_path: Mapped[str] = mapped_column(String(300))
    mime_type: Mapped[str] = mapped_column(String(50))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    exif_stripped: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=_now)


class Match(Base, TimestampMixin):
    __tablename__ = "matches"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    lost_report_id: Mapped[str] = mapped_column(UUID, ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    found_report_id: Mapped[str] = mapped_column(UUID, ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    score: Mapped[float] = mapped_column(Float)
    breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="suggested")
    lost_report: Mapped[Report] = relationship(foreign_keys=[lost_report_id])
    found_report: Mapped[Report] = relationship(foreign_keys=[found_report_id])
    __table_args__ = (
        UniqueConstraint("lost_report_id", "found_report_id", name="uq_match_pair"),
        CheckConstraint("score >= 0 and score <= 100", name="ck_match_score"),
        CheckConstraint("status in ('suggested','dismissed','verifying','confirmed','flagged')", name="ck_match_status"),
    )


class VerificationRequest(Base, TimestampMixin):
    __tablename__ = "verification_requests"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(UUID, ForeignKey("matches.id", ondelete="CASCADE"), index=True)
    claimant_id: Mapped[str] = mapped_column(UUID, ForeignKey("profiles.id"), index=True)
    reviewer_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("profiles.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewer_note: Mapped[str | None] = mapped_column(Text)
    handover_note: Mapped[str | None] = mapped_column(Text)
    match: Mapped[Match] = relationship()
    answers: Mapped[list["VerificationAnswer"]] = relationship(cascade="all, delete-orphan")
    __table_args__ = (CheckConstraint(
        "status in ('pending','under_review','approved','rejected','completed')", name="ck_verification_status"),)


class VerificationAnswer(Base):
    __tablename__ = "verification_answers"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    request_id: Mapped[str] = mapped_column(UUID, ForeignKey("verification_requests.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(String(300))
    answer: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=_now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(UUID, ForeignKey("profiles.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(500), default="")
    link: Mapped[str | None] = mapped_column(String(200))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TS, default=_now, index=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("profiles.id"), index=True)
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    meta: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(TS, default=_now, index=True)


class Recovery(Base):
    __tablename__ = "recoveries"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    verification_id: Mapped[str] = mapped_column(UUID, ForeignKey("verification_requests.id"), unique=True)
    lost_report_id: Mapped[str] = mapped_column(UUID, ForeignKey("reports.id"))
    found_report_id: Mapped[str] = mapped_column(UUID, ForeignKey("reports.id"))
    institution_id: Mapped[str | None] = mapped_column(UUID, ForeignKey("institutions.id"), index=True)
    location_name: Mapped[str | None] = mapped_column(String(200))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    handover_note: Mapped[str | None] = mapped_column(Text)
    recovered_at: Mapped[datetime] = mapped_column(TS, default=_now)


class AgentLog(Base):
    __tablename__ = "agent_logs"
    id: Mapped[str] = mapped_column(UUID, primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(String(40), index=True)
    agent: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(20))  # ok | error | timeout | skipped
    input_summary: Mapped[str | None] = mapped_column(String(500))
    output_summary: Mapped[str | None] = mapped_column(String(500))
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=_now, index=True)
