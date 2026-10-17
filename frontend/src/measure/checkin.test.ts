import { describe, expect, it } from "vitest";
import { assess, FIRST_ARM_ANGLE_MAX, outcomeMessage, POSE_TOLERANCE_DEG, toIngredients } from "./checkin";
import { LANDMARK, METHOD_VERSION, type Landmark } from "./maths";

const P = 0; // person
const B = 255; // background
const seen = { visibility: 0.9 };

function body(overrides: Record<number, Landmark> = {}): Landmark[] {
  const all: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, ...seen }));
  Object.assign(all, {
    [LANDMARK.LEFT_SHOULDER]: { x: 0.7, y: 0.2, ...seen },
    [LANDMARK.RIGHT_SHOULDER]: { x: 0.3, y: 0.2, ...seen },
    // Upper arms about 20° out: elbows 18 px out and 50 px down from the shoulders.
    [LANDMARK.LEFT_ELBOW]: { x: 0.88, y: 0.45, ...seen },
    [LANDMARK.RIGHT_ELBOW]: { x: 0.12, y: 0.45, ...seen },
    // Hands hanging below the hips, clear of the waist.
    [LANDMARK.LEFT_WRIST]: { x: 0.95, y: 0.75, ...seen },
    [LANDMARK.RIGHT_WRIST]: { x: 0.05, y: 0.75, ...seen },
    [LANDMARK.LEFT_HIP]: { x: 0.6, y: 0.7, ...seen },
    [LANDMARK.RIGHT_HIP]: { x: 0.4, y: 0.7, ...seen },
    ...overrides,
  });
  return all;
}

const span = (from: number, to: number) => Array.from({ length: 100 }, (_, x) => (x >= from && x <= to ? P : B));
// 100 x 200 image: shoulder row y=40, waist row y=105.
const goodRows = (y: number) => ({ 40: span(22, 78), 105: span(30, 70) })[y] ?? span(0, -1);

describe("assess", () => {
  it("asks for a retake when nobody is found", () => {
    expect(assess(null, 100, 200, goodRows, P)).toEqual({ kind: "no-person" });
  });

  it("asks for a retake when a joint is cut off: the numbers would be meaningless", () => {
    const outcome = assess(body({ [LANDMARK.LEFT_HIP]: { x: 0.6, y: 1.05, ...seen } }), 100, 200, goodRows, P);
    expect(outcome).toEqual({ kind: "missing", parts: ["hips"] });
  });

  it("asks for a retake when the outline isn't found on a measurement row", () => {
    const noWaist = (y: number) => (y === 40 ? span(22, 78) : span(0, -1));
    expect(assess(body(), 100, 200, noWaist, P)).toEqual({ kind: "no-edges", where: "waist" });
  });

  it("measures a good photo and builds the API ingredients", () => {
    const outcome = assess(body(), 100, 200, goodRows, P);
    expect(outcome.kind).toBe("measured");
    if (outcome.kind !== "measured") return;
    expect(outcome.flagged).toBe(false);
    expect(outcome.measurements.shoulderToWaist).toBeCloseTo(56 / 40);
    expect(outcome.ingredients).toEqual({
      shoulderEdgePx: 56,
      waistEdgePx: 40,
      shoulderJointPx: expect.closeTo(40),
      hipJointPx: expect.closeTo(20),
      torsoLengthPx: expect.closeTo(100),
      armAngleDeg: expect.closeTo(19.8, 1),
      methodVersion: METHOD_VERSION,
    });
  });

  it("measures but flags arms in the shoulder outline: real numbers, saved flagged", () => {
    const wide = (y: number) => (y === 40 ? span(0, 99) : goodRows(y));
    const outcome = assess(body(), 100, 200, wide, P);
    expect(outcome.kind).toBe("measured");
    if (outcome.kind === "measured") expect(outcome.flagged).toBe(true);
  });
});

describe("assess: catch-and-guide checks (ADR-008)", () => {
  it("asks to turn a sideways photo upright before anything else", () => {
    expect(assess(null, 200, 100, goodRows, P)).toEqual({ kind: "sideways" });
  });

  it("asks for a front photo when the left shoulder is on the image's left", () => {
    const back = body({
      [LANDMARK.LEFT_SHOULDER]: { x: 0.3, y: 0.2, ...seen },
      [LANDMARK.RIGHT_SHOULDER]: { x: 0.7, y: 0.2, ...seen },
    });
    expect(assess(back, 100, 200, goodRows, P)).toEqual({ kind: "back" });
  });

  it("asks to step closer when the shoulders fill under 15% of the width", () => {
    // A 400 x 800 photo with the same body in pixels: 56 px shoulders are 14% of the width.
    const px = (x: number, y: number) => ({ x: x / 400, y: y / 800, ...seen });
    const far = body({
      [LANDMARK.LEFT_SHOULDER]: px(80, 40),
      [LANDMARK.RIGHT_SHOULDER]: px(40, 40),
      [LANDMARK.LEFT_ELBOW]: px(98, 90),
      [LANDMARK.RIGHT_ELBOW]: px(22, 90),
      [LANDMARK.LEFT_WRIST]: px(110, 150),
      [LANDMARK.RIGHT_WRIST]: px(10, 150),
      [LANDMARK.LEFT_HIP]: px(70, 140),
      [LANDMARK.RIGHT_HIP]: px(50, 140),
    });
    const wide = (from: number, to: number) => Array.from({ length: 400 }, (_, x) => (x >= from && x <= to ? P : B));
    const rows = (y: number) => ({ 40: wide(32, 88), 105: wide(40, 80) })[y] ?? wide(0, -1);
    expect(assess(far, 400, 800, rows, P)).toEqual({ kind: "too-far" });
  });

  it("asks to move the arms away when a wrist touches the waist", () => {
    // Hands on hips: left wrist at the waist edge (x=70) at waist height (y=105).
    const handsOnHips = body({ [LANDMARK.LEFT_WRIST]: { x: 0.72, y: 0.525, ...seen } });
    expect(assess(handsOnHips, 100, 200, goodRows, P)).toEqual({ kind: "arms-touching" });
  });

  it("ignores hands hanging at the hips, even close to the body", () => {
    const hanging = body({ [LANDMARK.LEFT_WRIST]: { x: 0.72, y: 0.72, ...seen } });
    expect(assess(hanging, 100, 200, goodRows, P).kind).toBe("measured");
  });

  it("ignores a joint it can't see", () => {
    const unseen = body({ [LANDMARK.LEFT_WRIST]: { x: 0.72, y: 0.525, visibility: 0.1 } });
    expect(assess(unseen, 100, 200, goodRows, P).kind).toBe("measured");
  });

  it("accepts the first photo's arms within the sane range and rejects wider ones", () => {
    expect(assess(body(), 100, 200, goodRows, P, null).kind).toBe("measured");
    // Elbows 20 px out and 20 px down from the shoulders: 45°.
    const wide = body({
      [LANDMARK.LEFT_ELBOW]: { x: 0.9, y: 0.3, ...seen },
      [LANDMARK.RIGHT_ELBOW]: { x: 0.1, y: 0.3, ...seen },
    });
    const outcome = assess(wide, 100, 200, goodRows, P, null);
    expect(outcome.kind).toBe("pose");
    expect(outcomeMessage(outcome)).toContain(`${FIRST_ARM_ANGLE_MAX}°`);
  });

  it("matches the baseline's arm angle within the tolerance", () => {
    expect(assess(body(), 100, 200, goodRows, P, 19.8 + POSE_TOLERANCE_DEG - 0.1).kind).toBe("measured");
    const off = assess(body(), 100, 200, goodRows, P, 30);
    expect(off).toEqual({ kind: "pose", armAngleDeg: expect.closeTo(19.8, 1), baselineArmAngleDeg: 30 });
    expect(outcomeMessage(off)).toBe(
      "Your arms are at 20°; in your baseline photo they were at 30°. Hold them a little further out and retake, so the photos compare.",
    );
  });
});

describe("toIngredients", () => {
  it("sends exactly the seven fields the API accepts", () => {
    const outcome = assess(body(), 100, 200, goodRows, P);
    if (outcome.kind !== "measured") throw new Error("expected a measurement");
    expect(Object.keys(toIngredients(outcome.measurements)).sort()).toEqual(
      ["armAngleDeg", "hipJointPx", "methodVersion", "shoulderEdgePx", "shoulderJointPx", "torsoLengthPx", "waistEdgePx"].sort(),
    );
  });
});

describe("outcomeMessage", () => {
  it("names the missing part", () => {
    expect(outcomeMessage({ kind: "missing", parts: ["shoulders", "hips"] })).toMatch(/^Your shoulders and hips aren't fully in the photo/);
  });

  it("explains the row where the outline was lost", () => {
    expect(outcomeMessage({ kind: "no-edges", where: "shoulders" })).toMatch(/outline at the shoulders/);
  });

  it("says nothing for a good measurement and offers both choices for a flagged one", () => {
    const good = assess(body(), 100, 200, goodRows, P);
    expect(outcomeMessage(good)).toBeNull();
    const flagged = assess(body(), 100, 200, (y) => (y === 40 ? span(0, 99) : goodRows(y)), P);
    expect(outcomeMessage(flagged)).toMatch(/save it flagged/);
  });
});
