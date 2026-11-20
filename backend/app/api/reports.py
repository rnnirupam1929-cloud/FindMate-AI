from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.agents.orchestrator import Orchestrator
from app.api.common import (can_view_report, get_report_or_404, log, paginate, report_out, is_staff_for)
from app.core.database import get_db
from app.core.security import current_user, rate_limit
from app.models import Match, Profile, Report, ReportImage
from app.schemas import FlagIn, ReportIn, ReportOut, ReportPatch, StatusIn
from app.services.storage import get_storage, new_key, process_upload, verify_local_signature, LocalStorage

router = APIRouter()
MAX_IMAGES = 3
REQUIRED_FOR_SUBMIT = ("title", "description", "location_name")


def _validate_submittable(r: Report):
    problems = []
    if len((r.title or "").strip()) < 3:
        problems.append("Item name must be at least 3 characters.")
    if len((r.description or "").strip()) < 10:
        problems.append("Please describe the item in at least 10 characters.")
    if not (r.location_name or "").strip():
        problems.append("Please add the location.")
    if r.event_date is None:
        problems.append("Please add the date.")
    elif r.event_date.replace(tzinfo=r.event_date.tzinfo or timezone.utc) > datetime.now(timezone.utc):
        problems.append("The date cannot be in the future.")
    if problems:
        raise HTTPException(422, " ".join(problems))


def _own(db: Session, user: Profile, report_id: str) -> Report:
    r = get_report_or_404(db, report_id)
    if r.user_id != user.id:
        raise HTTPException(404, "Report not found.")
    return r


@router.post("/reports", response_model=ReportOut, status_code=201, dependencies=[Depends(rate_limit("report-create", 30, 60))])
def create_report(body: ReportIn, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    if body.kind == "lost":
        data["private_clues"] = None  # private clues only apply to found items
        data["verification_questions"] = None
    r = Report(**data, user_id=user.id, institution_id=user.institution_id, status="draft")
    db.add(r)
    db.commit()
    log(db, user.id, "report_draft_created", "report", r.id)
    return report_out(db, r, user)


@router.patch("/reports/{report_id}", response_model=ReportOut)
def update_report(report_id: str, body: ReportPatch, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, user, report_id)
    if r.status in ("recovered",) or db.scalars(select(Match.id).where(
            (Match.lost_report_id == r.id) | (Match.found_report_id == r.id), Match.status.in_(("verifying", "confirmed")))).first():
        raise HTTPException(409, "This report is part of an active verification or a completed recovery and can no longer be edited.")
    changes = body.model_dump(exclude_unset=True)
    if r.kind == "lost":
        changes.pop("private_clues", None)
        changes.pop("verification_questions", None)
    for k, v in changes.items():
        setattr(r, k, v)
    db.commit()
    if r.status == "open":
        r.processed_at = None
        db.commit()
        Orchestrator(db).process_report(r.id, force=True)  # re-match with the new details; pairs are unique
    log(db, user.id, "report_updated", "report", r.id)
    return report_out(db, r, user)


@router.post("/reports/{report_id}/submit", response_model=ReportOut)
def submit_report(report_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, user, report_id)
    if r.status != "draft":
        raise HTTPException(409, "This report has already been submitted.")
    _validate_submittable(r)
    r.status = "open"
    db.commit()
    log(db, user.id, f"{r.kind}_report_submitted", "report", r.id)
    Orchestrator(db).process_report(r.id)
    db.refresh(r)
    return report_out(db, r, user)


@router.post("/reports/{report_id}/status", response_model=ReportOut)
def set_status(report_id: str, body: StatusIn, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, user, report_id)
    if r.status not in ("open", "closed"):
        raise HTTPException(409, f"A report that is '{r.status}' cannot be changed manually.")
    r.status = body.status
    db.commit()
    log(db, user.id, f"report_{body.status}", "report", r.id)
    if body.status == "open":
        Orchestrator(db).process_report(r.id, force=True)
    return report_out(db, r, user)


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(report_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, user, report_id)
    busy = db.scalars(select(Match.id).where((Match.lost_report_id == r.id) | (Match.found_report_id == r.id),
                                             Match.status.in_(("verifying", "confirmed")))).first()
    if busy or r.status == "recovered":
        raise HTTPException(409, "This report is part of an active verification or a completed recovery and cannot be deleted.")
    storage = get_storage()
    for img in r.images:
        storage.delete(img.storage_path)
    db.execute(delete(Match).where((Match.lost_report_id == r.id) | (Match.found_report_id == r.id)))
    db.delete(r)
    db.commit()
    log(db, user.id, "report_deleted", "report", report_id)
    return Response(status_code=204)


@router.get("/reports")
def list_reports(kind: str | None = Query(None, pattern="^(lost|found)$"), status: str | None = None,
                 page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                 user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Report).where(Report.user_id == user.id).order_by(Report.created_at.desc())
    if kind:
        q = q.where(Report.kind == kind)
    if status:
        q = q.where(Report.status == status)
    rows, total = paginate(q, db, page, page_size)
    return {"items": [report_out(db, r, user) for r in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = get_report_or_404(db, report_id)
    if not can_view_report(db, user, r):
        raise HTTPException(404, "Report not found.")
    return report_out(db, r, user)


@router.post("/reports/{report_id}/flag", status_code=204)
def flag_report(report_id: str, body: FlagIn, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = get_report_or_404(db, report_id)
    if not can_view_report(db, user, r) or r.user_id == user.id:
        raise HTTPException(404, "Report not found.")
    r.is_flagged, r.flag_reason = True, body.reason
    db.commit()
    log(db, user.id, "report_flagged", "report", r.id, {"reason": body.reason})
    return Response(status_code=204)


@router.post("/reports/{report_id}/images", response_model=ReportOut, status_code=201,
             dependencies=[Depends(rate_limit("upload", 20, 60))])
def upload_image(report_id: str, file: UploadFile = File(...), user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, user, report_id)
    if r.status in ("recovered", "closed"):
        raise HTTPException(409, "Images cannot be added to this report.")
    if len(r.images) >= MAX_IMAGES:
        raise HTTPException(400, f"You can attach up to {MAX_IMAGES} images.")
    from app.core.config import get_settings
    raw = file.file.read(get_settings().max_upload_bytes + 1)
    img = process_upload(raw)  # validates type, strips EXIF/GPS, downsizes
    key = new_key(r.id, img.mime)
    get_storage().put(key, img.data, img.mime)
    db.add(ReportImage(report_id=r.id, storage_path=key, mime_type=img.mime, size_bytes=len(img.data),
                       width=img.width, height=img.height, sha256=img.sha256, exif_stripped=True))
    db.commit()
    db.refresh(r)
    return report_out(db, r, user)


@router.delete("/reports/{report_id}/images/{image_id}", response_model=ReportOut)
def delete_image(report_id: str, image_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, user, report_id)
    img = next((i for i in r.images if i.id == image_id), None)
    if img is None:
        raise HTTPException(404, "Image not found.")
    get_storage().delete(img.storage_path)
    db.delete(img)
    db.commit()
    db.refresh(r)
    return report_out(db, r, user)


@router.get("/files/{key:path}", include_in_schema=False)
def serve_local_file(key: str, exp: int, sig: str):
    """Serves locally stored images, only with a valid, unexpired signature. (Supabase mode uses Supabase signed URLs.)"""
    if not verify_local_signature(key, exp, sig):
        raise HTTPException(403, "This link is invalid or has expired.")
    try:
        data = LocalStorage().read(key)
    except FileNotFoundError:
        raise HTTPException(404, "File not found.")
    mime = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(key.rsplit(".", 1)[-1], "application/octet-stream")
    return Response(data, media_type=mime, headers={"Cache-Control": "private, max-age=300"})
