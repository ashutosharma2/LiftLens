import { describe, expect, it } from "vitest";
import { assess, outcomeMessage, toIngredients } from "./checkin";
import { LANDMARK, METHOD_VERSION, type Landmark } from "./maths";

const P = 0; // person
const B = 255; // background
const seen = { visibility: 0.9 };

function body(overrides: Record<number, Landmark> = {}): Landmark[] {
  const all: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, ...seen }));
  Object.assign(all, {
    [LANDMARK.LEFT_SHOULDER]: { x: 0.7, y: 0.2, ...seen },
    [LANDMARK.RIGHT_SHOULDER]: { x: 0.3, y: 0.2, ...seen },
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

describe("toIngredients", () => {
  it("sends exactly the six fields the API accepts", () => {
    const outcome = assess(body(), 100, 200, goodRows, P);
    if (outcome.kind !== "measured") throw new Error("expected a measurement");
    expect(Object.keys(toIngredients(outcome.measurements)).sort()).toEqual(
      ["hipJointPx", "methodVersion", "shoulderEdgePx", "shoulderJointPx", "torsoLengthPx", "waistEdgePx"].sort(),
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
