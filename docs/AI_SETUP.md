# AI features

## Matching signals (what is real today)
- **Description:** word overlap + character trigrams + a hand-made synonym list (backpack/rucksack, steel/metal, ...). It is lexical, not a neural model.
- **Photo:** by default a colour-histogram comparison. Optionally **OpenCLIP** (below).
- Category, colour, brand, location and date are rule-based. Weights: photo 35, description 25, category 15, location 15, date 10. A signal with no data is skipped, never faked.

## Turning on OpenCLIP
```bash
cd backend
pip install -r requirements-ai.txt        # torch (CPU) + open_clip_torch
export EMBEDDING_BACKEND=openclip         # optional: OPENCLIP_MODEL, OPENCLIP_PRETRAINED
python -m scripts.reindex_images          # once, so existing reports get embeddings
```
The first run downloads model weights (~600 MB for ViT-B-32) from Hugging Face, so the server needs internet access then. If the package or weights are unavailable, the app **falls back to the colour histogram** and logs a warning; reports never fail because of it.

Reports with a histogram and reports with an embedding are never compared with each other (no score is invented). CLIP similarities are stretched with `CLIP_FLOOR=0.55`, `CLIP_CEIL=0.95` (`app/services/matching.py`). **These are starting values and should be tuned on real FindMate photos.**

> Status: the integration code and its fallback are unit-tested with synthetic vectors. It has **not** been run with real CLIP weights, because the build environment cannot reach Hugging Face.

## Learning Agent
Records outcomes (confirmed, dismissed, claim approved/rejected). Admin → Matching shows a *suggested* weight set once there are at least 15 confirmed and 15 rejected examples. Each weight may move at most 30% from default. **Nothing changes until an admin presses Apply**, it only affects future matches, and Reset returns to defaults. There is no automatic retraining.
