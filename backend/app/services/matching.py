"""Hybrid matching engine (rule-based MVP).

Each component returns a similarity in [0, 1], or None when there is not enough information.
Missing components are excluded and the remaining weights are re-normalised, so a report with no
image is never penalised with a fake visual score. Final score is 0-100.

The visual component currently uses a basic colour-histogram comparison (see agents/vision.py).
It is NOT a CLIP model. Plug an embedding model into `ImageEmbedder` to replace it.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

DEFAULT_WEIGHTS = {"visual": 0.35, "description": 0.25, "category": 0.15, "location": 0.15, "date": 0.10}

CATEGORIES = ["electronics", "wallet_cards", "keys", "bags", "clothing", "books_stationery",
              "accessories", "id_documents", "water_bottles", "sports", "other"]
RELATED = {frozenset(p) for p in [("wallet_cards", "id_documents"), ("bags", "clothing"),
                                  ("accessories", "clothing"), ("books_stationery", "bags"),
                                  ("electronics", "accessories")]}
STOP = set("the a an and or of to in on at with is it my its this that was were for from has have had i we you "
           "lost found near left black white small big new old".split()) - {"black", "white"}
COLOR_SYNONYMS = {"grey": "gray", "navy": "blue", "maroon": "red", "violet": "purple", "golden": "gold", "silvery": "silver"}


def _stem(w: str) -> str:
    for suf in ("ing", "ies", "es", "s", "ed"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def tokens(text: str | None) -> list[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return [_stem(w) for w in words if w not in STOP and len(w) > 1]


def cosine(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    ca, cb = Counter(a), Counter(b)
    dot = sum(ca[t] * cb[t] for t in ca)
    return dot / (math.sqrt(sum(v * v for v in ca.values())) * math.sqrt(sum(v * v for v in cb.values())))


def norm_color(c: str | None) -> str | None:
    c = (c or "").strip().lower()
    return COLOR_SYNONYMS.get(c, c) or None


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@dataclass
class ReportView:
    """Plain data the engine needs; decouples scoring from the ORM so it is easy to unit-test."""
    category: str = "other"
    title: str = ""
    description: str = ""
    color: str | None = None
    brand: str | None = None
    location_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    event_date: datetime | None = None
    visual_features: dict | None = None


@dataclass
class MatchResult:
    score: float | None
    breakdown: dict[str, float | None] = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)
    used_components: list[str] = field(default_factory=list)


# ---- Components ------------------------------------------------------------
def category_similarity(a: ReportView, b: ReportView) -> float | None:
    if not a.category or not b.category:
        return None
    if a.category == b.category:
        return 1.0 if a.category != "other" else 0.5
    return 0.5 if frozenset((a.category, b.category)) in RELATED else 0.0


def description_similarity(a: ReportView, b: ReportView) -> float | None:
    parts: list[tuple[float, float]] = []  # (weight, similarity)
    ta, tb = tokens(f"{a.title} {a.description}"), tokens(f"{b.title} {b.description}")
    if ta and tb:
        parts.append((0.6, min(1.0, cosine(ta, tb) * 1.4)))
    ca, cb = norm_color(a.color), norm_color(b.color)
    if ca and cb:
        parts.append((0.25, 1.0 if ca == cb else 0.0))
    ba, bb = (a.brand or "").strip().lower(), (b.brand or "").strip().lower()
    if ba and bb:
        parts.append((0.15, 1.0 if ba == bb else (0.6 if ba in bb or bb in ba else 0.0)))
    if not parts:
        return None
    total = sum(w for w, _ in parts)
    return sum(w * s for w, s in parts) / total


def location_similarity(a: ReportView, b: ReportView) -> float | None:
    if None not in (a.latitude, a.longitude, b.latitude, b.longitude):
        d = haversine_m(a.latitude, a.longitude, b.latitude, b.longitude)
        if d <= 150:
            return 1.0
        if d >= 3000:
            return 0.0
        return 1.0 - (d - 150) / (3000 - 150)
    ta, tb = set(tokens(a.location_name)), set(tokens(b.location_name))
    if ta and tb:
        return len(ta & tb) / len(ta | tb)
    return None


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def date_similarity(lost: ReportView, found: ReportView) -> float | None:
    """Found item should surface on/after the day it was lost; decays over 30 days."""
    if not lost.event_date or not found.event_date:
        return None
    gap = (_aware(found.event_date) - _aware(lost.event_date)).total_seconds() / 86400
    if gap < -1:
        return 0.0
    if gap <= 1:
        return 1.0
    return max(0.0, 1.0 - (gap - 1) / 29)


def visual_similarity(a: ReportView, b: ReportView) -> float | None:
    fa, fb = a.visual_features, b.visual_features
    if not fa or not fb:
        return None
    if fa.get("kind") == "embedding" and fb.get("kind") == "embedding":  # future CLIP path
        va, vb = fa["vector"], fb["vector"]
        dot = sum(x * y for x, y in zip(va, vb))
        n = math.sqrt(sum(x * x for x in va)) * math.sqrt(sum(y * y for y in vb))
        return max(0.0, dot / n) if n else None
    ha, hb = fa.get("histogram"), fb.get("histogram")
    if ha and hb and len(ha) == len(hb):
        return sum(min(x, y) for x, y in zip(ha, hb))  # histogram intersection, histograms sum to 1
    return None


LABELS = {"visual": "Visual similarity (basic colour comparison)", "description": "Description similarity",
          "category": "Category", "location": "Location relevance", "date": "Date relevance"}


def score_pair(lost: ReportView, found: ReportView, weights: dict[str, float] | None = None,
               precomputed: dict[str, float | None] | None = None) -> MatchResult:
    w = weights or DEFAULT_WEIGHTS
    parts = {
        "visual": visual_similarity(lost, found),
        "description": description_similarity(lost, found),
        "category": category_similarity(lost, found),
        "location": location_similarity(lost, found),
        "date": date_similarity(lost, found),
    }
    parts.update(precomputed or {})  # e.g. the Location Agent's result
    available = {k: v for k, v in parts.items() if v is not None and w.get(k, 0) > 0}
    # Need at least two independent signals before we claim anything.
    if len(available) < 2:
        return MatchResult(None, parts, ["Not enough information on both reports to compare."], list(available))
    total_w = sum(w[k] for k in available)
    score = round(100 * sum(w[k] * v for k, v in available.items()) / total_w, 1)

    reasons = []
    c = parts["category"]
    if c == 1.0:
        reasons.append(f"Same category ({lost.category.replace('_', ' ')}).")
    elif c == 0.5:
        reasons.append("Closely related categories.")
    elif c == 0.0:
        reasons.append("Different categories.")
    if norm_color(lost.color) and norm_color(lost.color) == norm_color(found.color):
        reasons.append(f"Same colour ({norm_color(lost.color)}).")
    if lost.brand and found.brand and lost.brand.strip().lower() == found.brand.strip().lower():
        reasons.append(f"Same brand ({lost.brand}).")
    d = parts["description"]
    if d is not None:
        shared = sorted(set(tokens(f"{lost.title} {lost.description}")) & set(tokens(f"{found.title} {found.description}")))
        if shared:
            reasons.append("Shared description words: " + ", ".join(shared[:6]) + ".")
    loc = parts["location"]
    if loc is not None:
        reasons.append("Reported close to the same place." if loc >= 0.7 else
                       "Reported in a nearby area." if loc >= 0.3 else "Reported far apart.")
    dt = parts["date"]
    if dt is not None:
        reasons.append("Found around the time it was lost." if dt >= 0.7 else
                       "Found some days after it was lost." if dt > 0 else "Found before it was reported lost.")
    if parts["visual"] is not None:
        reasons.append(f"Image colour profile similarity: {round(parts['visual'] * 100)}% (basic comparison, not AI recognition).")
    else:
        reasons.append("Visual comparison skipped: an image is missing on one of the reports.")
    return MatchResult(score, parts, reasons, list(available))


def is_plausible(result: MatchResult, lost: ReportView, found: ReportView, threshold: float) -> bool:
    if result.score is None or result.score < threshold:
        return False
    cat = result.breakdown.get("category")
    desc = result.breakdown.get("description")
    # Different category and weak text overlap is almost never the same object.
    return not (cat == 0.0 and (desc is None or desc < 0.25))
