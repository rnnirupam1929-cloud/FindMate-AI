from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (clean_text, current_user, default_institution, hash_password, issue_dev_token,
                               rate_limit, verify_password)
from app.models import DevCredential, Institution, Profile, _uuid
from app.schemas import DevAuthIn, InstitutionOut, ProfileOut, ProfileUpdate

router = APIRouter()


@router.post("/auth/dev/signup", dependencies=[Depends(rate_limit("auth", 10, 60))])
def dev_signup(body: DevAuthIn, db: Session = Depends(get_db)):
    """Local development only. In production, Supabase Auth handles sign-up, email verification and password reset."""
    if get_settings().auth_mode != "local":
        raise HTTPException(404, "Not found.")
    email = body.email.lower()
    if db.scalars(select(Profile).where(Profile.email == email)).first():
        raise HTTPException(409, "An account with this email already exists.")
    inst = default_institution(db)
    role = "admin" if email in get_settings().admin_email_set else "student"
    p = Profile(id=_uuid(), email=email, full_name=clean_text(body.full_name) or "", role=role,
                institution_id=inst.id if inst else None)
    db.add(p)
    db.flush()
    db.add(DevCredential(user_id=p.id, password_hash=hash_password(body.password)))
    db.commit()
    return {"access_token": issue_dev_token(p.id, p.email), "user": ProfileOut.model_validate(p)}


@router.post("/auth/dev/login", dependencies=[Depends(rate_limit("auth", 10, 60))])
def dev_login(body: DevAuthIn, db: Session = Depends(get_db)):
    if get_settings().auth_mode != "local":
        raise HTTPException(404, "Not found.")
    p = db.scalars(select(Profile).where(Profile.email == body.email.lower())).first()
    cred = db.get(DevCredential, p.id) if p else None
    if not p or not cred or not verify_password(body.password, cred.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    if p.is_suspended:
        raise HTTPException(403, "This account has been suspended.")
    return {"access_token": issue_dev_token(p.id, p.email), "user": ProfileOut.model_validate(p)}


@router.get("/me", response_model=ProfileOut)
def me(user: Profile = Depends(current_user)):
    return user


@router.patch("/me", response_model=ProfileOut)
def update_me(body: ProfileUpdate, user: Profile = Depends(current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.institution_id is not None:
        inst = db.get(Institution, body.institution_id)
        if not inst or not inst.is_active:
            raise HTTPException(400, "Unknown institution.")
        user.institution_id = inst.id
    db.commit()
    return user


@router.get("/institutions", response_model=list[InstitutionOut])
def institutions(db: Session = Depends(get_db)):
    return db.scalars(select(Institution).where(Institution.is_active.is_(True)).order_by(Institution.name)).all()
