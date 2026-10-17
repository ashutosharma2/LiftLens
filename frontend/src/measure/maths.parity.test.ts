// Checks the TypeScript maths against the Python reference on real photos.
// Reference files come from dev/export_fixture.py and are gitignored with the
// photos, so this suite skips when they're missing (e.g. in CI).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Landmark, measureFront } from "./maths";

interface ParityFixture {
  image: string;
  width: number;
  height: number;
  person_value: number;
  landmarks: Landmark[];
  waist_mask_row: number[];
  shoulder_mask_row: number[];
  python: {
    shoulder_width_px: number;
    shoulder_joint_width_px: number;
    shoulder_y: number;
    shoulder_left: number;
    shoulder_right: number;
    hip_width_px: number;
    shoulder_to_hip: number;
    waist_y: number;
    waist_left: number;
    waist_right: number;
    waist_width_px: number;
    shoulder_to_waist: number;
    shoulder_index: number;
    waist_index: number;
    torso_length_px: number;
    arm_angle_deg: number;
  };
}

const FIXTURES_DIR = join(import.meta.dirname, "../../../dev/fixtures");
const files = existsSync(FIXTURES_DIR)
  ? readdirSync(FIXTURES_DIR).filter((name) => name.endsWith(".parity.json"))
  : [];

const TOLERANCE = 0.01; // 1%

function expectWithin(actual: number, expected: number) {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(TOLERANCE);
}

describe.skipIf(files.length === 0)("parity with the Python reference", () => {
  for (const file of files) {
    it(file, () => {
      const fixture: ParityFixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
      const py = fixture.python;

      const result = measureFront(
        fixture.landmarks,
        fixture.width,
        fixture.height,
        (y) => {
          if (y === py.shoulder_y) return fixture.shoulder_mask_row;
          if (y === py.waist_y) return fixture.waist_mask_row;
          throw new Error(`Unexpected mask row ${y}`);
        },
        fixture.person_value,
      );

      expect(result.shoulderY).toBe(py.shoulder_y);
      expect(result.shoulderEdges).toEqual({ left: py.shoulder_left, right: py.shoulder_right });
      expect(result.shoulderCheck).toBe("ok");
      expect(result.waistY).toBe(py.waist_y);
      expect(result.waistEdges).toEqual({ left: py.waist_left, right: py.waist_right });
      expectWithin(result.shoulderWidthPx, py.shoulder_width_px);
      expectWithin(result.shoulderJointWidthPx, py.shoulder_joint_width_px);
      expectWithin(result.hipWidthPx, py.hip_width_px);
      expectWithin(result.waistWidthPx, py.waist_width_px);
      expectWithin(result.shoulderToHip, py.shoulder_to_hip);
      expectWithin(result.shoulderToWaist, py.shoulder_to_waist);
      expectWithin(result.shoulderIndex, py.shoulder_index);
      expectWithin(result.waistIndex, py.waist_index);
      expectWithin(result.torsoLengthPx, py.torso_length_px);
      expectWithin(result.armAngleDeg, py.arm_angle_deg);
    });
  }
});
