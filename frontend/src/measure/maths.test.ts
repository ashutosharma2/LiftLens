import { describe, expect, it } from "vitest";
import {
  missingParts,
  checkShoulder,
  distance,
  findBodyEdges,
  type Landmark,
  LANDMARK,
  measureFront,
  toPx,
  torsoCenterX,
  torsoPoints,
  waistRowY,
} from "./maths";

const P = 0; // person
const B = 255; // background

function landmarksWith(points: Record<number, Landmark>): Landmark[] {
  const all: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }));
  for (const [index, point] of Object.entries(points)) all[Number(index)] = point;
  return all;
}

// A 100 x 200 image with shoulders at y=40 and hips at y=140.
const BODY = landmarksWith({
  [LANDMARK.LEFT_SHOULDER]: { x: 0.7, y: 0.2 },
  [LANDMARK.RIGHT_SHOULDER]: { x: 0.3, y: 0.2 },
  [LANDMARK.LEFT_HIP]: { x: 0.6, y: 0.7 },
  [LANDMARK.RIGHT_HIP]: { x: 0.4, y: 0.7 },
});

describe("toPx", () => {
  it("scales normalised coordinates by image size", () => {
    expect(toPx({ x: 0.5, y: 0.25 }, 200, 400)).toEqual({ x: 100, y: 100 });
  });
});

describe("distance", () => {
  it("is the straight-line distance (3-4-5 triangle)", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("waistRowY and torsoCenterX", () => {
  const points = torsoPoints(BODY, 100, 200);

  it("puts the waist 65% of the way from shoulders to hips", () => {
    // shoulders y=40, hips y=140 -> 40 + 0.65 * 100 = 105
    expect(waistRowY(points)).toBe(105);
  });

  it("centres between the shoulders", () => {
    expect(torsoCenterX(points)).toBe(50);
  });
});

describe("findBodyEdges", () => {
  it("finds the outermost person pixels around the start", () => {
    const row = [B, B, P, P, P, P, B, B];
    expect(findBodyEdges(row, 3, P)).toEqual({ left: 2, right: 5 });
  });

  it("stops at the first gap, so arms beside the torso are excluded", () => {
    const row = [P, P, B, P, P, P, B, P];
    expect(findBodyEdges(row, 4, P)).toEqual({ left: 3, right: 5 });
  });

  it("returns null when the start is on background", () => {
    expect(findBodyEdges([P, B, P], 1, P)).toBeNull();
  });

  it("returns null when the start is outside the row", () => {
    expect(findBodyEdges([P, P], 5, P)).toBeNull();
  });

  it("reaches the image edge when the person fills the row", () => {
    expect(findBodyEdges([P, P, P, P], 1, P)).toEqual({ left: 0, right: 3 });
  });
});

describe("checkShoulder", () => {
  it("accepts outer shoulders a bit wider than the joints", () => {
    expect(checkShoulder(56, 40)).toBe("ok"); // 1.4
  });

  it("flags outlines far wider than the joints (arms joined the outline)", () => {
    expect(checkShoulder(80, 40)).toBe("too_wide"); // 2.0
  });

  it("flags outlines narrower than expected (walk stopped at a gap)", () => {
    expect(checkShoulder(40, 40)).toBe("too_narrow"); // 1.0
  });
});

describe("measureFront", () => {
  // Body outline spans columns 22..78 on the shoulder row (y=40)
  // and 30..70 on the waist row (y=105).
  const span = (from: number, to: number) =>
    Array.from({ length: 100 }, (_, x) => (x >= from && x <= to ? P : B));
  const rows: Record<number, number[]> = { 40: span(22, 78), 105: span(30, 70) };
  const maskRowAt = (y: number) => rows[y] ?? span(0, -1);

  it("measures shoulders and waist edge to edge", () => {
    const result = measureFront(BODY, 100, 200, maskRowAt, P);

    expect(result.shoulderY).toBe(40);
    expect(result.shoulderEdges).toEqual({ left: 22, right: 78 });
    expect(result.shoulderWidthPx).toBe(56);
    expect(result.shoulderJointWidthPx).toBeCloseTo(40);
    expect(result.shoulderCheck).toBe("ok");
    expect(result.waistY).toBe(105);
    expect(result.waistEdges).toEqual({ left: 30, right: 70 });
    expect(result.waistWidthPx).toBe(40);
    expect(result.shoulderToWaist).toBeCloseTo(1.4);
  });

  it("keeps shoulder-to-hip joint to joint", () => {
    const result = measureFront(BODY, 100, 200, maskRowAt, P);
    expect(result.hipWidthPx).toBeCloseTo(20);
    expect(result.shoulderToHip).toBeCloseTo(2);
  });

  it("normalises widths by hip joint width", () => {
    const result = measureFront(BODY, 100, 200, maskRowAt, P);
    expect(result.shoulderIndex).toBeCloseTo(56 / 20);
    expect(result.waistIndex).toBeCloseTo(40 / 20);
  });

  it("gives the same indexes when the photo is taken from twice as far", () => {
    // Twice the distance: same normalised landmarks in an image twice as big
    // is equivalent to every pixel width halving; build that directly.
    const near = measureFront(BODY, 100, 200, maskRowAt, P);
    const half = (from: number, to: number) =>
      Array.from({ length: 50 }, (_, x) => (x >= from && x <= to ? P : B));
    const farRows: Record<number, number[]> = { 20: half(11, 39), 52: half(15, 35) };
    const far = measureFront(BODY, 50, 100, (y) => farRows[y] ?? half(0, -1), P);

    expect(far.waistWidthPx).toBeCloseTo(near.waistWidthPx / 2);
    expect(far.waistIndex).toBeCloseTo(near.waistIndex);
    expect(far.shoulderIndex).toBeCloseTo(near.shoulderIndex);
  });

  it("flags a too-wide shoulder outline without failing", () => {
    const wide: Record<number, number[]> = { ...rows, 40: span(0, 99) }; // arms raised into the outline
    const result = measureFront(BODY, 100, 200, (y) => wide[y] ?? span(0, -1), P);
    expect(result.shoulderCheck).toBe("too_wide");
  });

  it("asks for the shoulder row, then the waist row", () => {
    const rowsRequested: number[] = [];
    measureFront(BODY, 100, 200, (y) => (rowsRequested.push(y), maskRowAt(y)), P);
    expect(rowsRequested).toEqual([40, 105]);
  });

  it("throws a clear error when no person is at the torso centre", () => {
    const row = Array(100).fill(B);
    expect(() => measureFront(BODY, 100, 200, () => row, P)).toThrow(/No person pixels/);
  });
});

describe("missingParts", () => {
  const seen = { visibility: 0.9 };
  const body = (overrides: Record<number, Landmark> = {}) =>
    landmarksWith({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.7, y: 0.2, ...seen },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.3, y: 0.2, ...seen },
      [LANDMARK.LEFT_HIP]: { x: 0.6, y: 0.7, ...seen },
      [LANDMARK.RIGHT_HIP]: { x: 0.4, y: 0.7, ...seen },
      ...overrides,
    });

  it("is empty when all four joints are in frame and clearly seen", () => {
    expect(missingParts(body())).toEqual([]);
  });

  it("reports a joint outside the frame", () => {
    expect(missingParts(body({ [LANDMARK.LEFT_HIP]: { x: 0.6, y: 1.08, ...seen } }))).toEqual(["hips"]);
  });

  it("reports a joint MediaPipe isn't sure about", () => {
    expect(missingParts(body({ [LANDMARK.RIGHT_SHOULDER]: { x: 0.3, y: 0.2, visibility: 0.3 } }))).toEqual(["shoulders"]);
  });

  it("reports each part once", () => {
    const parts = missingParts(
      body({ [LANDMARK.LEFT_SHOULDER]: { x: -0.1, y: 0.2, ...seen }, [LANDMARK.RIGHT_SHOULDER]: { x: 1.1, y: 0.2, ...seen } }),
    );
    expect(parts).toEqual(["shoulders"]);
  });
});

describe("torso length", () => {
  it("is the distance from the shoulder midpoint to the hip midpoint", () => {
    const span = (from: number, to: number) => Array.from({ length: 100 }, (_, x) => (x >= from && x <= to ? P : B));
    const rows: Record<number, number[]> = { 40: span(22, 78), 105: span(30, 70) };
    const result = measureFront(BODY, 100, 200, (y) => rows[y] ?? span(0, -1), P);
    // shoulders midpoint (50, 40), hips midpoint (50, 140)
    expect(result.torsoLengthPx).toBeCloseTo(100);
  });
});
