from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.learning import LearningAgent
from app.api.common import log, paginate, report_out
from app.core.database import get_db
from app.core.security import require_admin, require_staff
from app.models import AgentLog, Institution, Match, Profile, Recovery, Report, VerificationRequest
from app.schemas import InstitutionIn, InstitutionOut, ModerationPatch, ProfileOut, UserAdminPatch

router = APIRouter(prefix="/admin")


@router.get("/stats")
def stats(user: Profile = Depends(require_staff), db: Session = Depends(get_db)):
    def n(model, *where):
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0
    return {
        "users": n(Profile), "reports": n(Report, Report.status != "draft"), "open_reports": n(Report, Report.status == "open"),
        "flagged_reports": n(Report, Report.is_flagged.is_(True)), "matches": n(Match),
        "verifications_open": n(VerificationRequest, VerificationRequest.status.in_(("pending", "under_review"))),
        "recoveries": n(Recovery),
        "agent_errors": n(AgentLog, AgentLog.status != "ok"),
        "feedback": LearningAgent(db).summary(),
    }


@router.get("/users")
def users(q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
          user: Profile = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(Profile).order_by(Profile.created_at.desc())
    if q:
        stmt = stmt.where(Profile.email.ilike(f"%{q}%") | Profile.full_name.ilike(f"%{q}%"))
    rows, total = paginate(stmt, db, page, page_size)
    return {"items": [ProfileOut.model_validate(r).model_dump() | {"is_suspended": r.is_suspended} for r in rows],
            "total": total, "page": page, "page_size": page_size}


@router.patch("/users/{uid}")
def patch_user(uid: str, body: UserAdminPatch, admin: Profile = Depends(require_admin), db: Session = Depends(get_db)):
    target = db.get(Profile, uid)
    if target is None:
        raise HTTPException(404, "User not found.")
    if target.id == admin.id:
        raise HTTPException(400, "You cannot change your own role or suspension.")
    if body.role is not None:
        target.role = body.role
    if body.is_suspended is not None:
        target.is_suspended = body.is_suspended
    db.commit()
    log(db, admin.id, "admin_user_updated", "user", uid, body.model_dump(exclude_none=True))
    return ProfileOut.model_validate(target).model_dump() | {"is_suspended": target.is_suspended}


@router.get("/reports")
def reports(flagged: bool = False, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
            user: Profile = Depends(require_staff), db: Session = Depends(get_db)):
    stmt = select(Report).where(Report.status != "draft").order_by(Report.created_at.desc())
    if user.role != "admin":
        stmt = stmt.where(Report.institution_id == user.institution_id)
    if flagged:
        stmt = stmt.where(Report.is_flagged.is_(True))
    rows, total = paginate(stmt, db, page, page_size)
    return {"items": [report_out(db, r, user, with_images=False).model_dump() | {"flag_reason": r.flag_reason} for r in rows],
            "total": total, "page": page, "page_size": page_size}


@router.patch("/reports/{rid}")
def moderate(rid: str, body: ModerationPatch, user: Profile = Depends(require_staff), db: Session = Depends(get_db)):
    r = db.get(Report, rid)
    if r is None or (user.role != "admin" and r.institution_id != user.institution_id):
        raise HTTPException(404, "Report not found.")
    if body.is_hidden is not None:
        r.is_hidden = body.is_hidden
    if body.is_flagged is not None:
        r.is_flagged = body.is_flagged
        if not body.is_flagged:
            r.flag_reason = None
    db.commit()
    log(db, user.id, "report_moderated", "report", rid, body.model_dump(exclude_none=True))
    return report_out(db, r, user, with_images=False)


@router.get("/institutions", response_model=list[InstitutionOut])
def list_institutions(user: Profile = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(Institution).order_by(Institution.name)).all()


@router.post("/institutions", response_model=InstitutionOut, status_code=201)
def create_institution(body: InstitutionIn, user: Profile = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalars(select(Institution).where((Institution.slug == body.slug) | (Institution.name == body.name))).first():
        raise HTTPException(409, "An institution with that name or slug already exists.")
    i = Institution(**body.model_dump())
    db.add(i)
    db.commit()
    return i


@router.patch("/institutions/{iid}", response_model=InstitutionOut)
def update_institution(iid: str, body: InstitutionIn, user: Profile = Depends(require_admin), db: Session = Depends(get_db)):
    i = db.get(Institution, iid)
    if i is None:
        raise HTTPException(404, "Institution not found.")
    for k, v in body.model_dump().items():
        setattr(i, k, v)
    db.commit()
    return i
