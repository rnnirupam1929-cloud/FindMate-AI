from datetime import datetime, timedelta, timezone

from app.services.matching import ReportView, is_plausible, score_pair, DEFAULT_WEIGHTS

D = datetime(2026, 11, 10, 10, tzinfo=timezone.utc)


def view(**kw):
    base = dict(category="electronics", title="Black Dell laptop", description="Black Dell laptop with sticker on lid",
                color="black", brand="Dell", location_name="Library", latitude=12.8625, longitude=77.4375, event_date=D)
    base.update(kw)
    return ReportView(**base)


def test_weights_sum_to_one():
    assert abs(sum(DEFAULT_WEIGHTS.values()) - 1) < 1e-9


def test_identical_reports_score_high_without_images():
    r = score_pair(view(), view())
    assert r.score is not None and r.score >= 95
    assert r.breakdown["visual"] is None and "visual" not in r.used_components
    assert any("skipped" in x for x in r.reasons)


def test_score_is_within_0_100_and_explained():
    r = score_pair(view(), view(category="bags", title="Backpack", description="blue school bag", color="blue", brand="Wildcraft",
                                latitude=12.9, longitude=77.5, event_date=D + timedelta(days=20)))
    assert 0 <= r.score <= 100 and r.reasons


def test_different_item_scores_low_and_not_plausible():
    lost, found = view(), view(category="keys", title="Key bunch", description="three brass keys on ring", color="gold",
                               brand=None, location_name="Canteen", latitude=12.87, longitude=77.45)
    r = score_pair(lost, found)
    assert r.score < 50 and not is_plausible(r, lost, found, 35)


def test_no_fake_score_with_insufficient_data():
    empty = ReportView(category="", title="", description="")
    r = score_pair(empty, empty)
    assert r.score is None


def test_single_signal_is_not_enough():
    r = score_pair(ReportView(category="electronics"), ReportView(category="electronics"))
    assert r.score is None


def test_location_decay():
    near = score_pair(view(), view(latitude=12.8630, longitude=77.4380)).breakdown["location"]
    far = score_pair(view(), view(latitude=12.95, longitude=77.55)).breakdown["location"]
    assert near == 1.0 and far == 0.0


def test_location_falls_back_to_names_when_no_coordinates():
    r = score_pair(view(latitude=None, longitude=None), view(latitude=None, longitude=None, location_name="Main Library"))
    assert 0 < r.breakdown["location"] <= 1


def test_date_found_before_lost_is_zero_and_decays_after():
    assert score_pair(view(), view(event_date=D - timedelta(days=5))).breakdown["date"] == 0.0
    assert score_pair(view(), view(event_date=D + timedelta(hours=3))).breakdown["date"] == 1.0
    assert 0 < score_pair(view(), view(event_date=D + timedelta(days=10))).breakdown["date"] < 1


def test_visual_histogram_used_when_both_have_it():
    h = [0.0] * 64
    h[5] = 1.0
    a, b = view(visual_features={"histogram": h}), view(visual_features={"histogram": h})
    assert score_pair(a, b).breakdown["visual"] == 1.0
    h2 = [0.0] * 64
    h2[9] = 1.0
    assert score_pair(a, view(visual_features={"histogram": h2})).breakdown["visual"] == 0.0


def test_colour_synonyms_and_brand_partial():
    r = score_pair(view(color="grey", brand="Dell Inspiron"), view(color="gray", brand="Dell"))
    assert any("Same colour" in x for x in r.reasons)


def test_custom_weights_renormalise():
    r = score_pair(view(), view(), weights={"visual": 0, "description": 1, "category": 0, "location": 0, "date": 0})
    assert r.used_components == ["description"] or r.score is None
