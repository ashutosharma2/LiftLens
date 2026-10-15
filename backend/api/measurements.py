"""Building stored measurements and scoring a user's history. Pure functions."""

from dataclasses import asdict, dataclass

from score import ScoreResult, flagged_result, progress_result, ratio_result, since_previous_result
from validation import Ingredients

# Same plausible range as SHOULDER_EDGE_TO_JOINT_MIN/MAX in frontend/src/measure/maths.ts.
SHOULDER_EDGE_TO_JOINT_MIN = 1.1
SHOULDER_EDGE_TO_JOINT_MAX = 1.8


def shoulder_check(edge_px: float, joint_px: float) -> str:
    ratio = edge_px / joint_px
    if ratio > SHOULDER_EDGE_TO_JOINT_MAX:
        return "too_wide"
    if ratio < SHOULDER_EDGE_TO_JOINT_MIN:
        return "too_narrow"
    return "ok"


def build_card(user_id: str, timestamp: str, ing: Ingredients) -> dict:
    """The item stored in DynamoDB. Ratio and check are computed here, never trusted from the client."""
    return {
        "userId": user_id,
        "timestamp": timestamp,
        "shoulderToWaist": ing.shoulder_edge_px / ing.waist_edge_px,
        "shoulderEdgePx": ing.shoulder_edge_px,
        "waistEdgePx": ing.waist_edge_px,
        "shoulderJointPx": ing.shoulder_joint_px,
        "hipJointPx": ing.hip_joint_px,
        "torsoLengthPx": ing.torso_length_px,
        "shoulderCheck": shoulder_check(ing.shoulder_edge_px, ing.shoulder_joint_px),
        "methodVersion": ing.method_version,
    }


@dataclass(frozen=True)
class ScoredHistory:
    """A user's history, each card scored only against cards of its own method (ADR-007)."""

    current_method: str | None  # method of the most recent card
    baseline_timestamp: str | None  # baseline of the current method
    baseline_timestamps: frozenset[str]  # every method's baseline
    items: list[tuple[dict, ScoreResult]]  # oldest first


def _by_method(cards: list[dict]) -> dict[str, list[dict]]:
    """Cards grouped by methodVersion, each group oldest first."""
    groups: dict[str, list[dict]] = {}
    for card in sorted(cards, key=lambda card: card["timestamp"]):
        groups.setdefault(card["methodVersion"], []).append(card)
    return groups


def score_history(cards: list[dict]) -> ScoredHistory:
    """Score every card against its method's baseline: that method's earliest card whose shoulderCheck is ok.

    Different methods are different rulers, so a score never compares across them.
    """
    ordered = sorted(cards, key=lambda card: card["timestamp"])
    baselines = {
        method: next((card for card in group if card["shoulderCheck"] == "ok"), None)
        for method, group in _by_method(cards).items()
    }

    items = []
    for card in ordered:
        baseline = baselines[card["methodVersion"]]
        if card["shoulderCheck"] != "ok":
            result = flagged_result(card["shoulderToWaist"], card["shoulderCheck"])
        elif card is baseline:
            result = ratio_result(card["shoulderToWaist"])
        else:
            result = progress_result(card["shoulderToWaist"], baseline["shoulderToWaist"])
        items.append((card, result))

    current_method = ordered[-1]["methodVersion"] if ordered else None
    current_baseline = baselines.get(current_method)
    return ScoredHistory(
        current_method=current_method,
        baseline_timestamp=current_baseline["timestamp"] if current_baseline else None,
        baseline_timestamps=frozenset(card["timestamp"] for card in baselines.values() if card),
        items=items,
    )


def since_previous(cards: list[dict]) -> dict[str, ScoreResult]:
    """For each ok card after the first of its method, its change since the previous ok card of the same method.

    Flagged cards are skipped; the first card of a new method has no previous.
    """
    changes = {}
    for group in _by_method(cards).values():
        ok_cards = [card for card in group if card["shoulderCheck"] == "ok"]
        for previous, current in zip(ok_cards, ok_cards[1:]):
            changes[current["timestamp"]] = since_previous_result(current["shoulderToWaist"], previous["shoulderToWaist"])
    return changes


def public_card(card: dict, is_baseline: bool) -> dict:
    """What the browser sees. Pixel ingredients are never returned."""
    return {
        "timestamp": card["timestamp"],
        "shoulderToWaist": card["shoulderToWaist"],
        "shoulderCheck": card["shoulderCheck"],
        "methodVersion": card["methodVersion"],
        "isBaseline": is_baseline,
    }


def score_dict(result: ScoreResult) -> dict:
    return asdict(result)
