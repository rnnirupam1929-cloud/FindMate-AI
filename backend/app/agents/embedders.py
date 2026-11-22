"""Optional neural image embedder (OpenCLIP). Imported lazily so the base install stays small."""
import logging
from functools import lru_cache

from PIL import Image

from app.core.config import get_settings

log = logging.getLogger("findmate.embedder")


class OpenCLIPEmbedder:
    model_id = "openclip"

    def __init__(self, model_name: str, pretrained: str):
        import open_clip  # noqa: PLC0415  (optional dependency)
        import torch  # noqa: PLC0415

        self._torch = torch
        self._model, _, self._preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained)
        self._model.eval()

    def embed(self, image: Image.Image) -> list[float]:
        with self._torch.no_grad():
            x = self._preprocess(image.convert("RGB")).unsqueeze(0)
            f = self._model.encode_image(x)
            f = f / f.norm(dim=-1, keepdim=True)
        return [round(float(v), 6) for v in f[0].tolist()]


@lru_cache(maxsize=1)
def _load(backend: str, model: str, pretrained: str):
    if backend != "openclip":
        return None
    try:
        return OpenCLIPEmbedder(model, pretrained)
    except Exception as exc:  # missing package, no weights, no network... never break report creation
        log.warning("OpenCLIP unavailable (%s); falling back to colour histogram.", exc)
        return None


def load_embedder():
    s = get_settings()
    return _load(s.embedding_backend, s.openclip_model, s.openclip_pretrained)
