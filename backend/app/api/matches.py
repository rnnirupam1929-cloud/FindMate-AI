from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.agents.learning import LearningAgent
from app.agents.notification import notify
from app.agents.verification import questions_for
from app.api.common import get_match_for, log, match_out, paginate
from app.core.database import get_db
from app.core.security import current_user
from app.models import Match, Profile, Report, VerificationRequest
from app.schemas import FlagIn

router = APIRouter()


@router.get("/matches")
def list_matches(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                 user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    q = (select(Match).join(Report, Match.lost_report_id == Report.id)
         .where(or_(Report.user_id == user.id, Match.found_report_id.in_(select(Report.id).where(Report.user_id == user.id))))
         .order_by(Match.score.desc(), Match.created_at.desc()))
    q = q.where(Match.status == status) if status else q.where(Match.status != "dismissed")
    rows, total = paginate(q, db, page, page_size)
    return {"items": [match_out(db, m, user) for m in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/matches/{match_id}")
def get_match(match_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    m, _ = get_match_for(db, user, match_id)
    return match_out(db, m, user)


@router.post("/matches/{match_id}/dismiss")
def dismiss(match_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    m, side = get_match_for(db, user, match_id)
    if side == "staff":
        raise HTTPException(403, "Only the people involved can dismiss a match.")
    if m.status not in ("suggested", "flagged"):
        raise HTTPException(409, f"A match that is '{m.status}' cannot be dismissed.")
    m.status = "dismissed"
    db.commit()
    LearningAgent(db).record(m, "dismissed", user.id)
    log(db, user.id, "match_dismissed", "match", m.id)
    return match_out(db, m, user)


@router.post("/matches/{match_id}/flag")
def flag(match_id: str, body: FlagIn, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    m, side = get_match_for(db, user, match_id)
    if side == "staff":
        raise HTTPException(403, "Only the people involved can report a match.")
    if m.status in ("confirmed",):
        raise HTTPException(409, "This match is already completed.")
    m.status = "flagged"
    other = m.found_report if side == "lost" else m.lost_report
    other.is_flagged, other.flag_reason = True, body.reason
    db.commit()
    LearningAgent(db).record(m, "flagged", user.id)
    log(db, user.id, "match_flagged", "match", m.id, {"reason": body.reason})
    for staff in db.scalars(select(Profile).where(Profile.role == "admin")):
        notify(db, staff.id, "suspicious_report", "Suspicious match reported", body.reason[:200], "/admin")
    return match_out(db, m, user)


@router.post("/matches/{match_id}/verify", status_code=201)
def start_verification(match_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    m, side = get_match_for(db, user, match_id)
    if side != "lost":
        raise HTTPException(403, "Only the person who lost the item can request verification.")
    if m.status != "suggested":
        raise HTTPException(409, f"Verification cannot be started for a match that is '{m.status}'.")
    if m.found_report.status != "open":
        raise HTTPException(409, "The found item is no longer available.")
    v = VerificationRequest(match_id=m.id, claimant_id=user.id, status="pending")
    db.add(v)
    m.status = "verifying"
    db.commit()
    log(db, user.id, "verification_requested", "verification", v.id)
    notify(db, m.found_report.user_id, "verification_request", "Someone is claiming your found item",
           f"A claimant is answering ownership questions for '{m.found_report.title}'.", f"/verifications/{v.id}")
    return {"id": v.id, "status": v.status, "questions": questions_for(m.found_report)}
