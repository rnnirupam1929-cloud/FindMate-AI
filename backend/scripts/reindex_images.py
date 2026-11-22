"""Recompute visual features for every report image (run after changing EMBEDDING_BACKEND).

    cd backend && python -m scripts.reindex_images

Reports with colour-histogram features and reports with CLIP embeddings are never compared with each other,
so after switching on OpenCLIP, run this once so old reports can be matched on photos too.
"""
from sqlalchemy import select

from app.agents.vision import VisionAgent, VisionIn
from app.core.database import SessionLocal
from app.models import Report, ReportImage


def main() -> None:
    with SessionLocal() as db:
        ids = db.scalars(select(ReportImage.report_id).distinct()).all()
        done = 0
        for rid in ids:
            out = VisionAgent(db).run(VisionIn(report_id=rid))
            report = db.get(Report, rid)
            if report is not None and out.features:
                report.visual_features = out.features
                done += 1
        db.commit()
        print(f"Re-indexed {done} of {len(ids)} reports with images.")


if __name__ == "__main__":
    main()
