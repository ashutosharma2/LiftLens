// Turns a detection into what the check-in screen should do with the photo.
// Pure, so every rule is unit-tested. The rule: retake what would be
// meaningless, flag what is real but suspicious (ADR-004, ADR-008, docs/scoring.md).
import type { Ingredients } from "../api/client";
import {
  armsTouchingWaist,
  EdgesNotFoundError,
  isBackView,
  isSideways,
  measureFront,
  METHOD_VERSION,
  MIN_SHOULDER_SHARE,
  missingParts,
  shoulderShare,
  type BodyPart,
  type EdgeRow,
  type FrontMeasurements,
  type Landmark,
} from "./maths";

/** How far a photo's arm angle may be from the baseline's (degrees). Placeholder until calibrated from repeat photos. */
export const POSE_TOLERANCE_DEG = 5;

/** Arm angles accepted when there's no baseline yet: they measured sensibly in real photos; 35° broke the ratio. */
export const FIRST_ARM_ANGLE_MIN = 10;
export const FIRST_ARM_ANGLE_MAX = 35;

export type Outcome =
  | { kind: "sideways" }
  | { kind: "no-person" }
  | { kind: "missing"; parts: BodyPart[] }
  | { kind: "back" }
  | { kind: "no-edges"; where: EdgeRow }
  | { kind: "too-far" }
  | { kind: "arms-touching" }
  | { kind: "pose"; armAngleDeg: number; baselineArmAngleDeg: number | null }
  | { kind: "measured"; measurements: FrontMeasurements; ingredients: Ingredients; flagged: boolean };

/**
 * Checks run in this order and only the first failure is shown, so the person
 * gets one clear fix at a time. baselineArmAngleDeg is the arm angle of the
 * user's baseline photo (null before the first check-in).
 */
export function assess(
  landmarks: Landmark[] | null,
  width: number,
  height: number,
  maskRowAt: (y: number) => ArrayLike<number>,
  personValue: number,
  baselineArmAngleDeg: number | null = null,
): Outcome {
  if (isSideways(width, height)) return { kind: "sideways" };
  if (!landmarks) return { kind: "no-person" };

  const parts = missingParts(landmarks);
  if (parts.length > 0) return { kind: "missing", parts };
  if (isBackView(landmarks)) return { kind: "back" };

  let measurements: FrontMeasurements;
  try {
    measurements = measureFront(landmarks, width, height, maskRowAt, personValue);
  } catch (err) {
    if (err instanceof EdgesNotFoundError) return { kind: "no-edges", where: err.where };
    throw err;
  }

  if (shoulderShare(measurements, width) < MIN_SHOULDER_SHARE) return { kind: "too-far" };
  if (armsTouchingWaist(landmarks, width, measurements)) return { kind: "arms-touching" };

  const angle = measurements.armAngleDeg;
  const poseOk =
    baselineArmAngleDeg === null
      ? angle >= FIRST_ARM_ANGLE_MIN && angle <= FIRST_ARM_ANGLE_MAX
      : Math.abs(angle - baselineArmAngleDeg) <= POSE_TOLERANCE_DEG;
  if (!poseOk) return { kind: "pose", armAngleDeg: angle, baselineArmAngleDeg };

  return {
    kind: "measured",
    measurements,
    ingredients: toIngredients(measurements),
    flagged: measurements.shoulderCheck !== "ok",
  };
}

/** The five pixel ingredients and the arm angle the API stores, plus the method version (docs/api.md). */
export function toIngredients(m: FrontMeasurements): Ingredients {
  return {
    shoulderEdgePx: m.shoulderWidthPx,
    waistEdgePx: m.waistWidthPx,
    shoulderJointPx: m.shoulderJointWidthPx,
    hipJointPx: m.hipWidthPx,
    torsoLengthPx: m.torsoLengthPx,
    armAngleDeg: m.armAngleDeg,
    methodVersion: METHOD_VERSION,
  };
}

/** What to tell the person, in plain words, for each outcome that needs one. */
export function outcomeMessage(outcome: Outcome): string | null {
  switch (outcome.kind) {
    case "sideways":
      return "Your phone was sideways. Turn it upright and retake.";
    case "back":
      return "This looks like a back photo. LiftLens measures front photos for now: face the camera and retake.";
    case "too-far":
      return "You're too far from the camera to measure. Step closer and retake.";
    case "arms-touching":
      return "Your arms or hands are touching your waist, so it can't be measured. Hold your arms slightly away from your body and retake.";
    case "pose": {
      const now = Math.round(outcome.armAngleDeg);
      if (outcome.baselineArmAngleDeg === null) {
        return `Your arms are at ${now}° from your body. Hold them slightly out, between ${FIRST_ARM_ANGLE_MIN}° and ${FIRST_ARM_ANGLE_MAX}°, and retake. This pose becomes your baseline.`;
      }
      const then = Math.round(outcome.baselineArmAngleDeg);
      const way = outcome.armAngleDeg > outcome.baselineArmAngleDeg ? "closer to your body" : "a little further out";
      return `Your arms are at ${now}°; in your baseline photo they were at ${then}°. Hold them ${way} and retake, so the photos compare.`;
    }
    case "no-person":
      return "We couldn't find a person in this photo. Check the light and stand inside the outline.";
    case "missing": {
      const what = outcome.parts.join(" and ");
      return `Your ${what} aren't fully in the photo. Step back so your upper body and hips fit inside the outline.`;
    }
    case "no-edges":
      return `We couldn't find your outline at the ${outcome.where}. Try a plain background and even light.`;
    case "measured":
      if (!outcome.flagged) return null;
      return outcome.measurements.shoulderCheck === "too_wide"
        ? "Your arms may be in the shoulder outline. Retake with your arms slightly away from your sides, or save it flagged: it won't count towards progress."
        : "Your shoulder outline looks too narrow. Retake facing the camera squarely, or save it flagged: it won't count towards progress.";
  }
}
