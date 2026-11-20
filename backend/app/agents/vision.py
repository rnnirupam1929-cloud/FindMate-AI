"""Vision Agent: extracts visual features from report images.

MVP: a 64-bin RGB colour histogram + dominant colour name (real, deterministic, but basic).
Integration point: implement `ImageEmbedder` with OpenCLIP and return it from `get_embedder()`;
the matching engine already understands {"kind": "embedding", "vector": [...]} features.
"""
import io
from typing import Protocol

from PIL import Image
from pydantic import BaseModel

from app.agents.base import Agent
from app.models import ReportImage, Report
from app.services.storage import get_storage


class ImageEmbedder(Protocol):
    def embed(self, image: Image.Image) -> list[float]: ...


def get_embedder() -> ImageEmbedder | None:
    """Return an OpenCLIP-backed embedder here once the model is installed. None = not configured."""
    return None


class VisionIn(BaseModel):
    report_id: str


class VisionOut(BaseModel):
    features: dict | None = None
    note: str = ""


NAMED = {"black": (20, 20, 20), "white": (240, 240, 240), "gray": (128, 128, 128), "red": (200, 40, 40),
         "blue": (40, 70, 200), "green": (40, 150, 70), "yellow": (230, 210, 60), "brown": (120, 80, 40),
         "orange": (235, 140, 40), "purple": (130, 60, 160), "pink": (235, 130, 170)}


def histogram_features(img: Image.Image) -> dict:
    small = img.convert("RGB").resize((48, 48))
    bins = [0] * 64
    raw = small.tobytes()
    for k in range(0, len(raw), 3):
        r, g, b = raw[k], raw[k + 1], raw[k + 2]
        bins[(r // 64) * 16 + (g // 64) * 4 + (b // 64)] += 1
    total = sum(bins)
    hist = [round(x / total, 5) for x in bins]
    i = max(range(64), key=lambda k: hist[k])
    centre = (((i // 16) * 64 + 32), (((i // 4) % 4) * 64 + 32), ((i % 4) * 64 + 32))
    name = min(NAMED, key=lambda n: sum((a - b) ** 2 for a, b in zip(NAMED[n], centre)))
    return {"kind": "histogram", "histogram": hist, "dominant_color": name}


class VisionAgent(Agent[VisionIn, VisionOut]):
    name = "vision"
    input_model, output_model = VisionIn, VisionOut

    def run(self, data: VisionIn) -> VisionOut:
        image = self.db.query(ReportImage).filter(ReportImage.report_id == data.report_id).order_by(ReportImage.created_at).first()
        if image is None:
            return VisionOut(features=None, note="no image")
        img = Image.open(io.BytesIO(get_storage().read(image.storage_path)))
        embedder = get_embedder()
        if embedder is not None:
            return VisionOut(features={"kind": "embedding", "vector": embedder.embed(img)}, note="embedding")
        return VisionOut(features=histogram_features(img), note="colour histogram (basic)")
