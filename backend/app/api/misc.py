from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.common import match_out
from app.core.database import get_db
from app.core.security import current_user
from app.models import ActivityLog, Match, Notification, Profile, Recovery, Report, VerificationRequest

router = APIRouter()


@router.get("/notifications")
def notifications(unread_only: bool = False, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
                  user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    unread = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))) or 0
    return {"items": [{"id": n.id, "type": n.type, "title": n.title, "body": n.body, "link": n.link, "is_read": n.is_read,
                       "created_at": n.created_at.isoformat() + ("Z" if n.created_at.tzinfo is None else "")} for n in rows],
            "total": total, "unread": unread, "page": page, "page_size": page_size}


@router.post("/notifications/read-all", status_code=204)
def read_all(user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))):
        n.is_read = True
    db.commit()
    return Response(status_code=204)


@router.post("/notifications/{nid}/read", status_code=204)
def read_one(nid: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, nid)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "Notification not found.")
    n.is_read = True
    db.commit()
    return Response(status_code=204)


@router.get("/dashboard")
def dashboard(user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    def count(kind, *statuses):
        q = select(func.count()).select_from(Report).where(Report.user_id == user.id, Report.kind == kind)
        return db.scalar(q.where(Report.status.in_(statuses)) if statuses else q) or 0

    my_report_ids = select(Report.id).where(Report.user_id == user.id)
    matches = db.scalars(select(Match).where(Match.status == "suggested",
                         or_(Match.lost_report_id.in_(my_report_ids), Match.found_report_id.in_(my_report_ids)))
                         .order_by(Match.score.desc()).limit(5)).all()
    pending = db.scalar(select(func.count()).select_from(VerificationRequest).where(
        VerificationRequest.status.in_(("pending", "under_review")),
        or_(VerificationRequest.claimant_id == user.id,
            VerificationRequest.match_id.in_(select(Match.id).where(Match.found_report_id.in_(my_report_ids)))))) or 0
    recs = db.scalars(select(Recovery).where(or_(Recovery.lost_report_id.in_(my_report_ids), Recovery.found_report_id.in_(my_report_ids)))
                      .order_by(Recovery.recovered_at.desc()).limit(5)).all()
    recent = db.scalars(select(Report).where(Report.user_id == user.id).order_by(Report.created_at.desc()).limit(5)).all()
    activity = db.scalars(select(ActivityLog).where(ActivityLog.user_id == user.id).order_by(ActivityLog.created_at.desc()).limit(8)).all()
    unread = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))) or 0
    from app.api.common import report_out
    return {
        "lost_count": count("lost"), "found_count": count("found"),
        "open_lost": count("lost", "open"), "open_found": count("found", "open"),
        "suggested_matches": [match_out(db, m, user) for m in matches],
        "pending_verifications": pending, "unread_notifications": unread,
        "recoveries": [{"id": r.id, "recovered_at": r.recovered_at.isoformat(), "location_name": r.location_name,
                        "title": db.get(Report, r.lost_report_id).title} for r in recs],
        "recent_reports": [report_out(db, r, user) for r in recent],
        "activity": [{"id": a.id, "action": a.action, "created_at": a.created_at.isoformat()} for a in activity],
    }


@router.get("/map/points")
def map_points(user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    """Approximate public points for the user's institution. Coordinates are rounded to ~100 m; no user data."""
    rows = db.scalars(select(Report).where(Report.institution_id == user.institution_id, Report.status == "open",
                      Report.is_hidden.is_(False), Report.latitude.is_not(None), Report.longitude.is_not(None)).limit(500)).all()
    pts = [{"id": r.id, "kind": r.kind, "title": r.title, "category": r.category, "location_name": r.location_name,
            "latitude": round(r.latitude, 3), "longitude": round(r.longitude, 3), "mine": r.user_id == user.id} for r in rows]
    recs = db.scalars(select(Recovery).where(Recovery.institution_id == user.institution_id, Recovery.latitude.is_not(None)).limit(200)).all()
    pts += [{"id": r.id, "kind": "recovery", "title": "Item recovered", "category": None, "location_name": r.location_name,
             "latitude": r.latitude, "longitude": r.longitude, "mine": False} for r in recs]
    inst = user.institution
    return {"points": pts, "center": {"latitude": inst.latitude, "longitude": inst.longitude} if inst and inst.latitude else None}


@router.get("/public/stats")
def public_stats(db: Session = Depends(get_db)):
    """Aggregate counts for the landing page. Real values only, no personal data."""
    def n(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0
    return {"reports": n(Report, Report.status != "draft"), "recoveries": n(Recovery),
            "institutions": n(__import__("app.models", fromlist=["Institution"]).Institution)}
