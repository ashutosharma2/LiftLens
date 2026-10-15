import pytest

from measurements import build_card, public_card, score_history, shoulder_check, since_previous
from validation import Ingredients


def ing(shoulder=1029.0, waist=577.0, joint=690.0):
    return Ingredients(shoulder, waist, joint, 364.0, 905.0, "2026-10-posemask-v1")


def card(ts, ratio, check="ok", method="v1"):
    return {"timestamp": ts, "shoulderToWaist": ratio, "shoulderCheck": check, "methodVersion": method}


def test_server_computes_ratio_and_check():
    c = build_card("user-1", "2026-10-10T09:30:00.000Z", ing())
    assert c["shoulderToWaist"] == pytest.approx(1029 / 577)
    assert c["shoulderCheck"] == "ok"  # 1029 / 690 = 1.49
    assert c["userId"] == "user-1"


@pytest.mark.parametrize("edge,joint,expected", [(1029, 690, "ok"), (1400, 690, "too_wide"), (700, 690, "too_narrow")])
def test_shoulder_check(edge, joint, expected):
    assert shoulder_check(edge, joint) == expected


def test_empty_history_has_no_baseline():
    history = score_history([])
    assert (history.current_method, history.baseline_timestamp, history.items) == (None, None, [])


def test_first_ok_card_is_the_baseline_and_later_cards_are_scored_against_it():
    history = score_history([card("2026-09-08", 1.78), card("2026-09-01", 1.70)])
    assert history.baseline_timestamp == "2026-09-01"
    statuses = [(c["timestamp"], r.status) for c, r in history.items]
    assert statuses == [("2026-09-01", "baseline"), ("2026-09-08", "increased")]


def test_flagged_cards_are_kept_but_never_the_baseline():
    history = score_history(
        [card("2026-09-01", 2.1, "too_wide"), card("2026-09-08", 1.70), card("2026-09-15", 1.71)]
    )
    assert history.baseline_timestamp == "2026-09-08"
    assert [r.status for _, r in history.items] == ["flagged", "baseline", "no_clear_change"]


def test_only_flagged_cards_means_no_baseline():
    history = score_history([card("2026-09-01", 2.1, "too_wide")])
    assert history.baseline_timestamp is None
    assert history.items[0][1].status == "flagged"


def test_each_method_has_its_own_baseline_and_scores_never_cross_methods():
    history = score_history(
        [card("2026-09-01", 1.70, method="v1"), card("2026-09-08", 1.78, method="v1"), card("2026-10-15", 1.75, method="v2")]
    )
    assert history.current_method == "v2"
    assert history.baseline_timestamp == "2026-10-15"
    assert history.baseline_timestamps == {"2026-09-01", "2026-10-15"}
    results = {c["timestamp"]: r for c, r in history.items}
    assert results["2026-09-08"].inputs["baseline"] == 1.70  # still scored within v1
    assert results["2026-10-15"].status == "baseline"  # not compared with any v1 card


def test_current_method_is_the_latest_cards_even_before_it_has_a_baseline():
    history = score_history([card("2026-09-01", 1.70, method="v1"), card("2026-10-15", 2.1, "too_wide", method="v2")])
    assert history.current_method == "v2"
    assert history.baseline_timestamp is None
    assert history.baseline_timestamps == {"2026-09-01"}


def test_public_card_never_includes_pixels():
    full = build_card("user-1", "t1", ing())
    shown = public_card(full, is_baseline=True)
    assert not any(key.endswith("Px") for key in shown)
    assert "userId" not in shown
    assert shown["isBaseline"] is True


def test_since_previous_pairs_consecutive_ok_cards_and_skips_flagged():
    changes = since_previous(
        [card("2026-09-01", 1.70), card("2026-09-08", 2.1, "too_wide"), card("2026-09-15", 1.78)]
    )
    assert list(changes) == ["2026-09-15"]  # the baseline has no previous; the flagged card is skipped
    assert changes["2026-09-15"].inputs["previous"] == 1.70
    assert "since your previous check-in" in changes["2026-09-15"].explanation


def test_since_previous_never_compares_across_methods():
    changes = since_previous(
        [card("2026-09-01", 1.70, method="v1"), card("2026-09-08", 1.78, method="v1"), card("2026-10-15", 1.75, method="v2")]
    )
    assert list(changes) == ["2026-09-08"]  # the first v2 card has no previous of its own method
