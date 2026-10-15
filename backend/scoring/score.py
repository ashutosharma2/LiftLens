"""Explainable scoring for LiftLens.

V1 scores one number, the shoulder-to-waist ratio (edge to edge, see
docs/adr/004-scale-free-measurements.md), against the user's own first photo:

- ratio_result: the ratio itself, shown from the first photo on.
- progress_result: percent change since the first photo, from the second photo on.
- since_previous_result: percent change since the previous ok check-in.
- flagged_result: a photo that failed the shoulder plausibility check; shown, not scored.

Every result carries its formula, its named inputs and a one-sentence
explanation, so any number shown to a user can be recomputed by hand.
See docs/scoring.md.
"""

from dataclasses import dataclass, field
from math import isfinite

# Changes smaller than this (as a fraction) are treated as measurement noise.
# Placeholder until calibrated from same-session photos (see docs/scoring.md).
NOISE_THRESHOLD = 0.02

# Shoulder-to-waist ratios outside this range are rejected as implausible.
MIN_RATIO = 0.8
MAX_RATIO = 3.0


@dataclass(frozen=True)
class ScoreResult:
    name: str
    value: float
    status: str  # "baseline" | "increased" | "decreased" | "no_clear_change" | "flagged"
    formula: str
    inputs: dict[str, float] = field(default_factory=dict)
    explanation: str = ""


def validate_ratio(ratio: float, label: str = "shoulder_to_waist") -> float:
    if isinstance(ratio, bool) or not isinstance(ratio, (int, float)) or not isfinite(ratio):
        raise ValueError(f"{label} must be a finite number, got {ratio!r}")
    if not MIN_RATIO <= ratio <= MAX_RATIO:
        raise ValueError(f"{label} {ratio} is outside the plausible range {MIN_RATIO}–{MAX_RATIO}")
    return float(ratio)


def ratio_result(shoulder_to_waist: float) -> ScoreResult:
    ratio = validate_ratio(shoulder_to_waist)
    return ScoreResult(
        name="shoulder_to_waist",
        value=ratio,
        status="baseline",
        formula="shoulder_width / waist_width (both edge to edge)",
        inputs={"shoulder_to_waist": ratio},
        explanation=f"Your shoulders are {ratio:.2f}× as wide as your waist.",
    )


def flagged_result(shoulder_to_waist: float, shoulder_check: str) -> ScoreResult:
    """A measurement whose shoulder outline looked implausible: shown, not scored."""
    ratio = validate_ratio(shoulder_to_waist)
    return ScoreResult(
        name="shoulder_to_waist",
        value=ratio,
        status="flagged",
        formula="not scored: shoulder outline failed the plausibility check",
        inputs={"shoulder_to_waist": ratio},
        explanation=(
            "This photo was flagged (your arms may be in the shoulder outline), "
            "so it isn't used for progress."
            if shoulder_check == "too_wide"
            else "This photo was flagged (the shoulder outline looks too narrow), "
            "so it isn't used for progress."
        ),
    )


def format_percent(fraction: float) -> str:
    """A fraction as a percent with up to one decimal: 0.02 -> "2%", 0.025 -> "2.5%"."""
    return f"{fraction * 100:.1f}".removesuffix(".0") + "%"


def _change_result(current: float, reference: float, reference_label: str, since: str, name: str) -> ScoreResult:
    """Percent change from a reference ratio, with the noise rule. Shared by every change score."""
    current = validate_ratio(current, "current")
    reference = validate_ratio(reference, reference_label)

    change = (current - reference) / reference
    percent = change * 100
    numbers = f"({reference:.2f} → {current:.2f})"

    if abs(change) < NOISE_THRESHOLD:
        status = "no_clear_change"
        explanation = (
            f"Your shoulder-to-waist ratio changed {percent:+.1f}% since {since} {numbers}, "
            f"within the ±{format_percent(NOISE_THRESHOLD)} measurement noise, so there's no clear change yet."
        )
    elif change > 0:
        status = "increased"
        explanation = f"Your shoulder-to-waist ratio rose {percent:.1f}% since {since} {numbers}."
    else:
        status = "decreased"
        explanation = f"Your shoulder-to-waist ratio fell {abs(percent):.1f}% since {since} {numbers}."

    return ScoreResult(
        name=name,
        value=percent,
        status=status,
        formula=f"(current - {reference_label}) / {reference_label} × 100",
        inputs={"current": current, reference_label: reference, "noise_threshold": NOISE_THRESHOLD},
        explanation=explanation,
    )


def progress_result(current: float, baseline: float) -> ScoreResult:
    """Change since the user's first ok photo (the baseline)."""
    return _change_result(current, baseline, "baseline", "your first photo", "shoulder_to_waist_change_percent")


def since_previous_result(current: float, previous: float) -> ScoreResult:
    """Change since the user's previous ok check-in."""
    return _change_result(
        current, previous, "previous", "your previous check-in", "shoulder_to_waist_change_since_previous_percent"
    )
