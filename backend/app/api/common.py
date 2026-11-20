"""Shared serialisers and permission helpers. All privacy rules live here."""
from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import ActivityLog, Match, Profile, Report, VerificationRequest
from app.schemas import ImageOut, MatchOut, ReportOut
from app.services.storage import get_storage

STAFF = ("admin", "verification_agent")


def log(db: Session, user_id: str | None, action: str, entity_type: str | None = None, entity_id: str | None = None, meta: dict | None = None):
    db.add(ActivityLog(user_id=user_id, action=action, entity_type=entity_type, entity_id=entity_id, meta=meta))
    db.commit()


def is_staff_for(user: Profile, institution_id: str | None) -> bool:
    if user.role == "admin":
        return True
    return user.role == "verification_agent" and user.institution_id == institution_id


def can_see_private(user: Profile, report: Report) -> bool:
    return report.user_id == user.id or is_staff_for(user, report.institution_id)


def report_out(db: Session, report: Report, viewer: Profile, with_images: bool = True) -> ReportOut:
    mine = report.user_id == viewer.id
    private = can_see_private(viewer, report)
    images = []
    if with_images:
        storage = get_storage()
        images = [ImageOut(id=i.id, url=storage.signed_url(i.storage_path), width=i.width, height=i.height) for i in report.images]
    col = Match.lost_report_id if report.kind == "lost" else Match.found_report_id
    mc = db.scalar(select(func.count()).select_from(Match).where(col == report.id, Match.status != "dismissed")) or 0
    lat, lng = report.latitude, report.longitude
    if not mine and lat is not None and lng is not None:  # others only ever see approximate (~100 m) coordinates
        lat, lng = round(lat, 3), round(lng, 3)
    return ReportOut(
        id=report.id, kind=report.kind, title=report.title, category=report.category, description=report.description,
        color=report.color, brand=report.brand, location_name=report.location_name, latitude=lat, longitude=lng,
        event_date=report.event_date, approx_time=report.approx_time, additional_details=report.additional_details,
        status=report.status, is_flagged=report.is_flagged, is_hidden=report.is_hidden, is_mine=mine,
        created_at=report.created_at, updated_at=report.updated_at, images=images, match_count=mc,
        private_clues=report.private_clues if private else None,
        verification_questions=report.verification_questions if private else None)


def get_report_or_404(db: Session, report_id: str) -> Report:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found.")
    return r


def can_view_report(db: Session, user: Profile, report: Report) -> bool:
    if can_see_private(user, report):
        return True
    # The other party of a match may see the public part of the report.
    col, other = (Match.lost_report_id, Match.found_report_id) if report.kind == "lost" else (Match.found_report_id, Match.lost_report_id)
    other_report = Report.id == other
    q = select(Match.id).join(Report, other_report).where(col == report.id, Report.user_id == user.id, Match.status != "dismissed")
    return db.scalars(q).first() is not None


def match_party(user: Profile, m: Match) -> str | None:
    if m.lost_report.user_id == user.id:
        return "lost"
    if m.found_report.user_id == user.id:
        return "found"
    if is_staff_for(user, m.found_report.institution_id):
        return "staff"
    return None


def get_match_for(db: Session, user: Profile, match_id: str) -> tuple[Match, str]:
    m = db.get(Match, match_id)
    side = match_party(user, m) if m else None
    if m is None or side is None:
        raise HTTPException(404, "Match not found.")  # 404, not 403: don't reveal that it exists
    return m, side


def active_verification(db: Session, match_id: str) -> VerificationRequest | None:
    return db.scalars(select(VerificationRequest).where(VerificationRequest.match_id == match_id)
                      .order_by(VerificationRequest.created_at.desc())).first()


def match_out(db: Session, m: Match, user: Profile) -> MatchOut:
    side = match_party(user, m) or "staff"
    v = active_verification(db, m.id)
    return MatchOut(id=m.id, score=m.score, breakdown=m.breakdown, reasons=m.reasons, status=m.status,
                    created_at=m.created_at, lost_report=report_out(db, m.lost_report, user),
                    found_report=report_out(db, m.found_report, user), my_side=side,
                    verification_id=v.id if v else None, verification_status=v.status if v else None)


def paginate(q, db: Session, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    rows = db.scalars(q.offset((page - 1) * page_size).limit(page_size)).all()
    return rows, total
