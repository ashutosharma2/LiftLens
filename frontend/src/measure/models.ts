// MediaPipe model wrapper. Browser only: it needs WASM and WebGL, so it is
// exercised in the app, not in unit tests. The maths lives in maths.ts.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./maths";

/** Where the WASM runtime and model file are served from (self-hosted, see ADR-002). */
export interface ModelPaths {
  wasmBase: string;
  poseModel: string;
}

export interface Models {
  pose: PoseLandmarker;
}

/** What the maths needs from one photo: the person's joints and outline. */
export interface Person {
  landmarks: Landmark[];
  /** Row y of the person mask: PERSON_VALUE where the pose model sees the person. */
  maskRowAt: (y: number) => Uint8Array;
}

/** Value of person pixels in the mask rows returned by detectPerson. */
export const PERSON_VALUE = 1;

/**
 * A pixel counts as the person when the pose model is at least this sure.
 * Part of the measuring method: changing it needs a new METHOD_VERSION (ADR-007).
 */
export const PERSON_CONFIDENCE = 0.5;

export async function loadModels(paths: ModelPaths): Promise<Models> {
  const fileset = await FilesetResolver.forVisionTasks(paths.wasmBase);
  const pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: paths.poseModel },
    runningMode: "IMAGE",
    numPoses: 1,
    // The pose model's own outline: it separates a person from dark furniture
    // far better than the selfie segmenter did (ADR-007).
    outputSegmentationMasks: true,
  });
  return { pose };
}

type ImageInput = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** Model file served by the app itself (ADR-002); copied into public/ by scripts/copy-models.sh. */
export const DEFAULT_MODEL_PATHS: ModelPaths = {
  wasmBase: "/mediapipe/wasm",
  poseModel: "/models/pose_landmarker_lite.task",
};

let shared: Promise<Models> | null = null;

/**
 * Starts loading the model once and shares the result, so the check-in screen
 * can begin downloading as soon as it opens. A failed load can be retried.
 */
export function preloadModels(paths: ModelPaths = DEFAULT_MODEL_PATHS): Promise<Models> {
  shared ??= loadModels(paths).catch((err) => {
    shared = null;
    throw err;
  });
  return shared;
}

/** Joints and outline of the first person found, or null if nobody was detected. */
export function detectPerson(models: Models, image: ImageInput): Person | null {
  const result = models.pose.detect(image);
  try {
    const landmarks = result.landmarks[0];
    const mask = result.segmentationMasks?.[0];
    if (!landmarks) return null;
    if (!mask) throw new Error("Pose model returned no segmentation mask");
    // Threshold into a copy before close(): the mask's memory belongs to MediaPipe.
    const confidence = mask.getAsFloat32Array();
    const person = new Uint8Array(confidence.length);
    for (let i = 0; i < confidence.length; i++) {
      if (confidence[i] >= PERSON_CONFIDENCE) person[i] = PERSON_VALUE;
    }
    const maskWidth = mask.width;
    return { landmarks, maskRowAt: (y) => person.subarray(y * maskWidth, (y + 1) * maskWidth) };
  } finally {
    result.close();
  }
}
