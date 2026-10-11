// MediaPipe model wrappers. Browser only: these need WASM and WebGL, so they
// are exercised in the app, not in unit tests. The maths lives in maths.ts.
import { FilesetResolver, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./maths";

/** Where the WASM runtime and model files are served from (self-hosted, see ADR-002). */
export interface ModelPaths {
  wasmBase: string;
  poseModel: string;
  segmenterModel: string;
}

export interface Models {
  pose: PoseLandmarker;
  segmenter: ImageSegmenter;
}

/** Image plus everything the maths needs from the two models. */
export interface Detection {
  width: number;
  height: number;
  /** Landmarks of the first person found, or null if nobody was detected. */
  landmarks: Landmark[] | null;
  /** Row y of the segmentation mask. */
  maskRowAt: (y: number) => Uint8Array;
}

/**
 * Category value of person pixels in the selfie segmenter's mask.
 * The prototype found person = 0 (background is non-zero); confirm on a
 * real photo in the browser before relying on it.
 */
export const PERSON_VALUE = 0;

export async function loadModels(paths: ModelPaths): Promise<Models> {
  const fileset = await FilesetResolver.forVisionTasks(paths.wasmBase);
  const [pose, segmenter] = await Promise.all([
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: paths.poseModel },
      runningMode: "IMAGE",
      numPoses: 1,
    }),
    ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: paths.segmenterModel },
      runningMode: "IMAGE",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    }),
  ]);
  return { pose, segmenter };
}

type ImageInput = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** Model files served by the app itself (ADR-002); copied into public/ by scripts/copy-models.sh. */
export const DEFAULT_MODEL_PATHS: ModelPaths = {
  wasmBase: "/mediapipe/wasm",
  poseModel: "/models/pose_landmarker_lite.task",
  segmenterModel: "/models/selfie_segmenter.tflite",
};

let shared: Promise<Models> | null = null;

/**
 * Starts loading the models once and shares the result, so the check-in screen
 * can begin downloading as soon as it opens. A failed load can be retried.
 */
export function preloadModels(paths: ModelPaths = DEFAULT_MODEL_PATHS): Promise<Models> {
  shared ??= loadModels(paths).catch((err) => {
    shared = null;
    throw err;
  });
  return shared;
}

/** Landmarks of the first person found, or null if nobody was detected. */
export function detectPose(models: Models, image: ImageInput): Landmark[] | null {
  return models.pose.detect(image).landmarks[0] ?? null;
}

/** The person/background mask, copied out of MediaPipe's memory, with a row reader. */
export function segmentMask(models: Models, image: ImageInput): (y: number) => Uint8Array {
  const segResult = models.segmenter.segment(image);
  const mask = segResult.categoryMask;
  if (!mask) throw new Error("Segmenter returned no category mask");
  // Copy before close(): the mask's memory belongs to MediaPipe.
  const maskData = mask.getAsUint8Array().slice();
  const maskWidth = mask.width;
  segResult.close();
  return (y) => maskData.subarray(y * maskWidth, (y + 1) * maskWidth);
}

export function detect(models: Models, image: ImageInput): Detection {
  return {
    width: image.width,
    height: image.height,
    landmarks: detectPose(models, image),
    maskRowAt: segmentMask(models, image),
  };
}
