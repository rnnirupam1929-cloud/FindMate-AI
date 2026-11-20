from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.agents.communication import CommIn, CommunicationAgent
from app.agents.learning import LearningAgent
from app.agents.notification import notify
from app.agents.verification import assert_transition, questions_for
from app.api.common import is_staff_for, log, paginate, report_out
from app.core.database import get_db
from app.core.security import current_user, rate_limit
from app.models import Institution, Match, Profile, Recovery, Report, VerificationAnswer, VerificationRequest
from app.schemas import AnswersIn, CompleteIn, ReviewIn

router = APIRouter()


def _load(db: Session, user: Profile, vid: str) -> tuple[VerificationRequest, str]:
    """Returns (request, role) where role is claimant | reviewer. 404 for everyone else."""
    v = db.get(VerificationRequest, vid)
    if v is None:
        raise HTTPException(404, "Verification not found.")
    found = v.match.found_report
    if v.claimant_id == user.id:
        return v, "claimant"
    if found.user_id == user.id or is_staff_for(user, found.institution_id):
        return v, "reviewer"
    raise HTTPException(404, "Verification not found.")


def _out(db: Session, v: VerificationRequest, user: Profile, role: str) -> dict:
    m, found = v.match, v.match.found_report
    data = {
        "id": v.id, "status": v.status, "role": role, "match_id": m.id, "created_at": v.created_at, "updated_at": v.updated_at,
        "reviewer_note": v.reviewer_note if v.status in ("approved", "rejected", "completed") else None,
        "handover_note": v.handover_note, "questions": questions_for(found),
        "lost_report": report_out(db, m.lost_report, user), "found_report": report_out(db, found, user),
        "answers": [], "private_clues": None, "guidance": None,
    }
    if v.answers:  # answers are only ever shown to the claimant who wrote them and to authorised reviewers
        data["answers"] = [{"question": a.question, "answer": a.answer} for a in v.answers]
    if role == "reviewer":
        data["private_clues"] = found.private_clues
    if v.status in ("approved", "completed"):
        c = CommunicationAgent(db).run(CommIn(institution_name=(db.get(Institution, found.institution_id).name if found.institution_id else "your campus"),
                                              found_location=found.location_name))
        data["guidance"] = c.model_dump()
    return data


@router.get("/verifications")
def list_verifications(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                       user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    mine = select(Match.id).join(Report, Match.found_report_id == Report.id)
    if user.role == "admin":
        pass
    elif user.role == "verification_agent":
        mine = mine.where(or_(Report.user_id == user.id, Report.institution_id == user.institution_id))
    else:
        mine = mine.where(Report.user_id == user.id)
    q = (select(VerificationRequest).where(or_(VerificationRequest.claimant_id == user.id, VerificationRequest.match_id.in_(mine)))
         .order_by(VerificationRequest.updated_at.desc()))
    rows, total = paginate(q, db, page, page_size)
    items = []
    for v in rows:
        role = "claimant" if v.claimant_id == user.id else "reviewer"
        items.append({"id": v.id, "status": v.status, "role": role, "updated_at": v.updated_at,
                      "found_title": v.match.found_report.title, "lost_title": v.match.lost_report.title if role == "reviewer" or v.claimant_id == user.id else None})
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/verifications/{vid}")
def get_verification(vid: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    v, role = _load(db, user, vid)
    return _out(db, v, user, role)


@router.post("/verifications/{vid}/answers", dependencies=[Depends(rate_limit("answers", 10, 60))])
def submit_answers(vid: str, body: AnswersIn, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    v, role = _load(db, user, vid)
    if role != "claimant":
        raise HTTPException(403, "Only the claimant can submit answers.")
    assert_transition(v.status, "under_review")
    allowed = set(questions_for(v.match.found_report))
    for a in body.answers:
        if a.question not in allowed:
            raise HTTPException(422, "One of the answers does not match a verification question.")
        db.add(VerificationAnswer(request_id=v.id, question=a.question, answer=a.answer))
    v.status = "under_review"
    db.commit()
    log(db, user.id, "verification_answers_submitted", "verification", v.id)
    found = v.match.found_report
    notify(db, found.user_id, "verification_request", "Ownership answers need your review",
           f"Review the claim for '{found.title}'.", f"/verifications/{v.id}")
    return _out(db, v, user, role)


@router.post("/verifications/{vid}/review")
def review(vid: str, body: ReviewIn, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    v, role = _load(db, user, vid)
    if role != "reviewer" or v.claimant_id == user.id:
        raise HTTPException(403, "You are not allowed to review this claim.")
    assert_transition(v.status, body.decision)
    v.status, v.reviewer_id, v.reviewer_note = body.decision, user.id, body.note
    m = v.match
    if body.decision == "rejected":
        m.status = "dismissed"
    db.commit()
    LearningAgent(db).record(m, "claim_" + body.decision, user.id)
    log(db, user.id, f"verification_{body.decision}", "verification", v.id)
    word = "approved" if body.decision == "approved" else "not approved"
    notify(db, v.claimant_id, "verification_update", f"Your ownership claim was {word}",
           f"Claim for '{m.found_report.title}' was {word}.", f"/verifications/{v.id}")
    if m.found_report.user_id != user.id:
        notify(db, m.found_report.user_id, "verification_update", f"A claim on your found item was {word}", "", f"/verifications/{v.id}")
    return _out(db, v, user, role)


@router.post("/verifications/{vid}/complete")
def complete(vid: str, body: CompleteIn, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    v, role = _load(db, user, vid)
    if role != "reviewer":
        raise HTTPException(403, "Only the finder or a verification agent can record the handover.")
    assert_transition(v.status, "completed")
    m = v.match
    v.status, v.handover_note = "completed", body.handover_note
    m.status = "confirmed"
    m.lost_report.status = "recovered"
    m.found_report.status = "recovered"
    db.add(Recovery(verification_id=v.id, lost_report_id=m.lost_report_id, found_report_id=m.found_report_id,
                    institution_id=m.found_report.institution_id, location_name=m.found_report.location_name,
                    latitude=round(m.found_report.latitude, 3) if m.found_report.latitude is not None else None,
                    longitude=round(m.found_report.longitude, 3) if m.found_report.longitude is not None else None,
                    handover_note=body.handover_note))
    db.commit()
    LearningAgent(db).record(m, "confirmed", user.id)
    log(db, user.id, "recovery_completed", "verification", v.id)
    for uid in {v.claimant_id, m.found_report.user_id}:
        notify(db, uid, "recovery_completed", "Recovery completed", f"'{m.lost_report.title}' has been returned.", f"/verifications/{v.id}")
    return _out(db, v, user, role)
