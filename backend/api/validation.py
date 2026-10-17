"""Validation of the POST /api/measurements body. See docs/api.md."""

import json
from dataclasses import dataclass
from math import isfinite

from errors import ApiError
from score import MAX_RATIO, MIN_RATIO

MAX_BODY_BYTES = 2048
MIN_PX = 1
MAX_PX = 10_000
PIXEL_FIELDS = ("shoulderEdgePx", "waistEdgePx", "shoulderJointPx", "hipJointPx", "torsoLengthPx")
# Upper arms' angle from straight down: the pose, matched against the baseline in the browser (ADR-008).
ANGLE_FIELD = "armAngleDeg"
MAX_ANGLE_DEG = 90
FIELDS = (*PIXEL_FIELDS, ANGLE_FIELD, "methodVersion")
# Methods a new measurement may use: only the current one, so an outdated app
# can't add check-ins measured with an old ruler. Stored cards of earlier
# methods stay readable (ADR-007). Same as METHOD_VERSION in frontend/src/measure/maths.ts.
KNOWN_METHOD_VERSIONS = {"2026-10-posemask-v2"}


@dataclass(frozen=True)
class Ingredients:
    shoulder_edge_px: float
    waist_edge_px: float
    shoulder_joint_px: float
    hip_joint_px: float
    torso_length_px: float
    arm_angle_deg: float
    method_version: str


def parse_body(raw: str | None) -> Ingredients:
    if raw is None or raw == "":
        raise ApiError(400, "Body is required")
    if len(raw.encode("utf-8")) > MAX_BODY_BYTES:
        raise ApiError(413, f"Body must be at most {MAX_BODY_BYTES} bytes")

    try:
        body = json.loads(raw)
    except ValueError:
        raise ApiError(400, "Body must be valid JSON")
    if not isinstance(body, dict):
        raise ApiError(400, "Body must be a JSON object")

    unknown = sorted(set(body) - set(FIELDS))
    if unknown:
        raise ApiError(400, f"Unknown field: {unknown[0]}")
    missing = [name for name in FIELDS if name not in body]
    if missing:
        raise ApiError(400, f"Missing field: {missing[0]}")

    pixels = {}
    for name in PIXEL_FIELDS:
        value = body[name]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not isfinite(value)
            or not MIN_PX <= value <= MAX_PX
        ):
            raise ApiError(400, f"{name} must be a number between {MIN_PX} and {MAX_PX}")
        pixels[name] = float(value)

    angle = body[ANGLE_FIELD]
    if isinstance(angle, bool) or not isinstance(angle, (int, float)) or not isfinite(angle) or not 0 <= angle <= MAX_ANGLE_DEG:
        raise ApiError(400, f"{ANGLE_FIELD} must be a number between 0 and {MAX_ANGLE_DEG}")

    version = body["methodVersion"]
    if not isinstance(version, str) or version not in KNOWN_METHOD_VERSIONS:
        raise ApiError(400, "methodVersion is not a known version")

    ratio = pixels["shoulderEdgePx"] / pixels["waistEdgePx"]
    if not MIN_RATIO <= ratio <= MAX_RATIO:
        raise ApiError(400, f"shoulderEdgePx ÷ waistEdgePx must be between {MIN_RATIO} and {MAX_RATIO}")

    return Ingredients(
        shoulder_edge_px=pixels["shoulderEdgePx"],
        waist_edge_px=pixels["waistEdgePx"],
        shoulder_joint_px=pixels["shoulderJointPx"],
        hip_joint_px=pixels["hipJointPx"],
        torso_length_px=pixels["torsoLengthPx"],
        arm_angle_deg=float(angle),
        method_version=version,
    )
