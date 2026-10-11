// Turns a detection into what the check-in screen should do with the photo.
// Pure, so every rule is unit-tested. The rule: retake what would be
// meaningless, flag what is real but suspicious (ADR-004, docs/scoring.md).
import type { Ingredients } from "../api/client";
import {
  EdgesNotFoundError,
  measureFront,
  METHOD_VERSION,
  missingParts,
  type BodyPart,
  type EdgeRow,
  type FrontMeasurements,
  type Landmark,
} from "./maths";

export type Outcome =
  | { kind: "no-person" }
  | { kind: "missing"; parts: BodyPart[] }
  | { kind: "no-edges"; where: EdgeRow }
  | { kind: "measured"; measurements: FrontMeasurements; ingredients: Ingredients; flagged: boolean };

export function assess(
  landmarks: Landmark[] | null,
  width: number,
  height: number,
  maskRowAt: (y: number) => ArrayLike<number>,
  personValue: number,
): Outcome {
  if (!landmarks) return { kind: "no-person" };

  const parts = missingParts(landmarks);
  if (parts.length > 0) return { kind: "missing", parts };

  let measurements: FrontMeasurements;
  try {
    measurements = measureFront(landmarks, width, height, maskRowAt, personValue);
  } catch (err) {
    if (err instanceof EdgesNotFoundError) return { kind: "no-edges", where: err.where };
    throw err;
  }

  return {
    kind: "measured",
    measurements,
    ingredients: toIngredients(measurements),
    flagged: measurements.shoulderCheck !== "ok",
  };
}

/** The five numbers the API stores, plus the maths version (docs/api.md). */
export function toIngredients(m: FrontMeasurements): Ingredients {
  return {
    shoulderEdgePx: m.shoulderWidthPx,
    waistEdgePx: m.waistWidthPx,
    shoulderJointPx: m.shoulderJointWidthPx,
    hipJointPx: m.hipWidthPx,
    torsoLengthPx: m.torsoLengthPx,
    methodVersion: METHOD_VERSION,
  };
}

/** What to tell the person, in plain words, for each outcome that needs one. */
export function outcomeMessage(outcome: Outcome): string | null {
  switch (outcome.kind) {
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
