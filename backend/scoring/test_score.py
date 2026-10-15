import pytest

from score import NOISE_THRESHOLD, flagged_result, format_percent, progress_result, ratio_result, since_previous_result


class TestRatioResult:
    def test_reports_the_ratio_as_the_first_photo_baseline(self):
        result = ratio_result(1.784)
        assert result.value == pytest.approx(1.784)
        assert result.status == "baseline"
        assert result.inputs == {"shoulder_to_waist": 1.784}
        assert result.explanation == "Your shoulders are 1.78× as wide as your waist."

    def test_states_its_formula(self):
        assert "shoulder_width / waist_width" in ratio_result(1.5).formula


class TestProgressResult:
    # Riya's example from docs/scoring.md.
    def test_rise_beyond_noise_is_an_increase(self):
        result = progress_result(current=1.78, baseline=1.70)
        assert result.value == pytest.approx(4.70588, rel=1e-4)
        assert result.status == "increased"
        assert result.explanation == (
            "Your shoulder-to-waist ratio rose 4.7% since your first photo (1.70 → 1.78)."
        )

    def test_fall_beyond_noise_is_a_decrease(self):
        result = progress_result(current=1.60, baseline=1.70)
        assert result.status == "decreased"
        assert "fell 5.9%" in result.explanation

    def test_small_change_is_noise(self):
        result = progress_result(current=1.71, baseline=1.70)
        assert result.status == "no_clear_change"
        assert result.value == pytest.approx(0.588, rel=1e-3)
        assert f"within the ±{format_percent(NOISE_THRESHOLD)} measurement noise" in result.explanation

    def test_exactly_the_threshold_counts_as_a_change(self):
        result = progress_result(current=1.0 + NOISE_THRESHOLD, baseline=1.0)
        assert result.status == "increased"

    def test_inputs_let_anyone_recompute_the_value(self):
        result = progress_result(current=1.78, baseline=1.70)
        i = result.inputs
        assert result.value == pytest.approx((i["current"] - i["baseline"]) / i["baseline"] * 100)
        assert i["noise_threshold"] == NOISE_THRESHOLD

    def test_value_keeps_full_precision(self):
        assert progress_result(current=1.7811, baseline=1.7).value == pytest.approx(4.7706, rel=1e-4)


class TestValidation:
    @pytest.mark.parametrize("bad", [0, -1.2, 0.5, 3.5, float("nan"), float("inf"), "1.7", None, True])
    def test_rejects_implausible_or_non_numeric_ratios(self, bad):
        with pytest.raises(ValueError):
            ratio_result(bad)

    def test_names_which_input_was_bad(self):
        with pytest.raises(ValueError, match="baseline"):
            progress_result(current=1.7, baseline=5.0)


class TestFlaggedResult:
    def test_is_shown_but_not_scored(self):
        result = flagged_result(2.1, "too_wide")
        assert result.status == "flagged"
        assert result.value == pytest.approx(2.1)
        assert "arms may be in the shoulder outline" in result.explanation

    def test_explains_a_too_narrow_outline(self):
        assert "too narrow" in flagged_result(1.2, "too_narrow").explanation


class TestSincePreviousResult:
    def test_uses_the_same_noise_rule_and_wording(self):
        result = since_previous_result(current=1.78, previous=1.73)
        assert result.status == "increased"
        assert result.explanation == (
            "Your shoulder-to-waist ratio rose 2.9% since your previous check-in (1.73 → 1.78)."
        )
        assert result.formula == "(current - previous) / previous × 100"
        assert result.inputs["previous"] == 1.73

    def test_small_change_is_noise(self):
        assert since_previous_result(current=1.74, previous=1.73).status == "no_clear_change"

    def test_names_the_bad_input(self):
        with pytest.raises(ValueError, match="previous"):
            since_previous_result(current=1.7, previous=9.0)


class TestFormatPercent:
    @pytest.mark.parametrize(
        ("fraction", "label"),
        [(0.02, "2%"), (0.025, "2.5%"), (0.031, "3.1%"), (0.1, "10%")],
    )
    def test_shows_one_decimal_only_when_needed(self, fraction, label):
        assert format_percent(fraction) == label
