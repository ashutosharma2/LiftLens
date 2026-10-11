// Pure measurement maths: landmarks and mask rows in, numbers out.
// Ported from dev/landmark_test.py. No model, no browser APIs, so every
// function here is unit-testable with made-up data.

/** A pose landmark in normalised image coordinates (0..1). */
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

export interface Point {
  x: number;
  y: number;
}

/** MediaPipe pose landmark indices used by the measurements. */
export const LANDMARK = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

/** The waist sits this far down from the shoulder line to the hip line. */
export const WAIST_FRACTION = 0.65;

/**
 * Plausible range for outer shoulder width / shoulder joint width.
 * Good front photos measured 1.39–1.49. Wider usually means raised or spread
 * arms joined the outline; narrower means the walk stopped at a gap.
 */
export const SHOULDER_EDGE_TO_JOINT_MIN = 1.1;
export const SHOULDER_EDGE_TO_JOINT_MAX = 1.8;

export type ShoulderCheck = "ok" | "too_wide" | "too_narrow";

/**
 * Version of this measurement maths, stored with every saved measurement so
 * results from different versions can be told apart (ADR-005). Must be one the
 * API accepts (KNOWN_METHOD_VERSIONS in backend/api/validation.py).
 */
export const METHOD_VERSION = "2026-10-edge-v1";

/** A joint counts as seen when MediaPipe's visibility score is at least this. */
export const MIN_VISIBILITY = 0.5;

/** Joints a front measurement can't do without. */
export const REQUIRED_JOINTS = [
  { index: 11, part: "shoulders" },
  { index: 12, part: "shoulders" },
  { index: 23, part: "hips" },
  { index: 24, part: "hips" },
] as const;

export type BodyPart = (typeof REQUIRED_JOINTS)[number]["part"];

export interface TorsoPoints {
  leftShoulder: Point;
  rightShoulder: Point;
  leftHip: Point;
  rightHip: Point;
}

export interface BodyEdges {
  left: number;
  right: number;
}

export interface FrontMeasurements {
  /** Outer shoulder width: edge to edge of the body outline at the shoulder line. */
  shoulderWidthPx: number;
  /** Distance between the two shoulder joint landmarks. */
  shoulderJointWidthPx: number;
  shoulderY: number;
  shoulderEdges: BodyEdges;
  /** Whether outer shoulder width is plausible relative to joint width. */
  shoulderCheck: ShoulderCheck;
  /** Distance between the two hip joint landmarks. */
  hipWidthPx: number;
  /** Joint to joint: shoulder joints / hip joints. */
  shoulderToHip: number;
  waistY: number;
  waistEdges: BodyEdges;
  waistWidthPx: number;
  /** Edge to edge: outer shoulder width / waist width. */
  shoulderToWaist: number;
  /**
   * Widths divided by hip joint width. Hip bones don't change with training
   * or diet, so these stay comparable between photos taken at different
   * distances, unlike raw pixel widths.
   */
  shoulderIndex: number;
  waistIndex: number;
  /** Shoulder midpoint to hip midpoint: a bone length, stored for future rulers. */
  torsoLengthPx: number;
}

export function toPx(landmark: Landmark, width: number, height: number): Point {
  return { x: landmark.x * width, y: landmark.y * height };
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Body parts whose joints are cut off by the frame edge or not clearly seen.
 * A measurement needs all of them: an edge that isn't in the photo can't be measured.
 */
export function missingParts(landmarks: Landmark[]): BodyPart[] {
  const missing = new Set<BodyPart>();
  for (const { index, part } of REQUIRED_JOINTS) {
    const joint = landmarks[index];
    const inFrame = joint && joint.x >= 0 && joint.x <= 1 && joint.y >= 0 && joint.y <= 1;
    const seen = joint && (joint.visibility ?? 1) >= MIN_VISIBILITY;
    if (!inFrame || !seen) missing.add(part);
  }
  return [...missing];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function torsoPoints(landmarks: Landmark[], width: number, height: number): TorsoPoints {
  const at = (index: number) => {
    const landmark = landmarks[index];
    if (!landmark) throw new Error(`Missing landmark ${index}`);
    return toPx(landmark, width, height);
  };
  return {
    leftShoulder: at(LANDMARK.LEFT_SHOULDER),
    rightShoulder: at(LANDMARK.RIGHT_SHOULDER),
    leftHip: at(LANDMARK.LEFT_HIP),
    rightHip: at(LANDMARK.RIGHT_HIP),
  };
}

/** Pixel row of the shoulder line, midway between the two shoulder joints. */
export function shoulderRowY(points: TorsoPoints): number {
  return Math.trunc((points.leftShoulder.y + points.rightShoulder.y) / 2);
}

/** Pixel row of the waist: WAIST_FRACTION of the way from shoulders to hips. */
export function waistRowY(points: TorsoPoints): number {
  const shoulderMidY = (points.leftShoulder.y + points.rightShoulder.y) / 2;
  const hipMidY = (points.leftHip.y + points.rightHip.y) / 2;
  // Math.trunc matches Python's int() in the prototype.
  return Math.trunc(shoulderMidY + WAIST_FRACTION * (hipMidY - shoulderMidY));
}

/** Approximate torso centre column, midway between the shoulders. */
export function torsoCenterX(points: TorsoPoints): number {
  return Math.trunc((points.leftShoulder.x + points.rightShoulder.x) / 2);
}

/**
 * Walk left and right from startX along one mask row while pixels belong to
 * the person. Returns the outermost person pixels on each side, or null if
 * startX is not on the person. Stops at the first gap, e.g. between arm and torso.
 */
export function findBodyEdges(
  row: ArrayLike<number>,
  startX: number,
  personValue: number,
): BodyEdges | null {
  if (startX < 0 || startX >= row.length || row[startX] !== personValue) return null;

  let left = startX;
  while (left > 0 && row[left - 1] === personValue) left--;

  let right = startX;
  while (right < row.length - 1 && row[right + 1] === personValue) right++;

  return { left, right };
}

export type EdgeRow = "shoulders" | "waist";

/** The body outline wasn't found where the torso should be on a measurement row. */
export class EdgesNotFoundError extends Error {
  readonly where: EdgeRow;

  constructor(where: EdgeRow, y: number) {
    super(`No person pixels at the torso centre on the ${where} row (${y})`);
    this.name = "EdgesNotFoundError";
    this.where = where;
  }
}

export function checkShoulder(edgeWidth: number, jointWidth: number): ShoulderCheck {
  const ratio = edgeWidth / jointWidth;
  if (ratio > SHOULDER_EDGE_TO_JOINT_MAX) return "too_wide";
  if (ratio < SHOULDER_EDGE_TO_JOINT_MIN) return "too_narrow";
  return "ok";
}

/**
 * Front-photo measurements. Pixel widths depend on camera distance, so only
 * the ratios and indexes are meaningful to show or compare (see ADR-004).
 * maskRowAt(y) returns row y of the segmentation mask.
 */
export function measureFront(
  landmarks: Landmark[],
  width: number,
  height: number,
  maskRowAt: (y: number) => ArrayLike<number>,
  personValue: number,
): FrontMeasurements {
  const points = torsoPoints(landmarks, width, height);
  const centerX = torsoCenterX(points);
  const shoulderJointWidthPx = distance(points.leftShoulder, points.rightShoulder);
  const hipWidthPx = distance(points.leftHip, points.rightHip);

  const edgesAt = (y: number, where: EdgeRow) => {
    const edges = findBodyEdges(maskRowAt(y), centerX, personValue);
    if (!edges) throw new EdgesNotFoundError(where, y);
    return edges;
  };

  // Both widths are edge to edge on the mask, so the ratio compares like with like.
  const shoulderY = shoulderRowY(points);
  const shoulderEdges = edgesAt(shoulderY, "shoulders");
  const shoulderWidthPx = shoulderEdges.right - shoulderEdges.left;

  const waistY = waistRowY(points);
  const waistEdges = edgesAt(waistY, "waist");
  const waistWidthPx = waistEdges.right - waistEdges.left;

  return {
    shoulderWidthPx,
    shoulderJointWidthPx,
    shoulderY,
    shoulderEdges,
    shoulderCheck: checkShoulder(shoulderWidthPx, shoulderJointWidthPx),
    hipWidthPx,
    shoulderToHip: shoulderJointWidthPx / hipWidthPx,
    waistY,
    waistEdges,
    waistWidthPx,
    shoulderToWaist: shoulderWidthPx / waistWidthPx,
    shoulderIndex: shoulderWidthPx / hipWidthPx,
    waistIndex: waistWidthPx / hipWidthPx,
    torsoLengthPx: distance(midpoint(points.leftShoulder, points.rightShoulder), midpoint(points.leftHip, points.rightHip)),
  };
}
