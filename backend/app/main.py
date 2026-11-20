import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api import admin, auth, matches, misc, reports, verifications
from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.models import Institution

log = logging.getLogger("findmate")

SEED_INSTITUTIONS = [
    # Coordinates are approximate placeholders; edit them in the admin dashboard.
    dict(name="Dayananda Sagar University", slug="dsu", city="Bengaluru", latitude=12.8625, longitude=77.4375),
]


def seed(db):
    for data in SEED_INSTITUTIONS:
        if not db.scalars(select(Institution).where(Institution.slug == data["slug"])).first():
            db.add(Institution(**data))
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if get_settings().database_url.startswith("sqlite"):
        Base.metadata.create_all(engine)  # local convenience; Postgres schema comes from database/migrations
    with SessionLocal() as db:
        seed(db)
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="FindMate AI API", version="1.0.0", lifespan=lifespan,
                  description="Lost & found recovery platform. Match scores are leads, never proof of ownership.")
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_list, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
    for r in (auth.router, reports.router, matches.router, verifications.router, misc.router, admin.router):
        app.include_router(r, prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "auth_mode": s.auth_mode, "storage": s.storage_backend}

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("Unhandled error")
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})

    return app


app = create_app()
