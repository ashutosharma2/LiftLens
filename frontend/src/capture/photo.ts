// Turns a camera frame or an uploaded file into a canvas. The canvas stays in
// memory on this device and is what the measuring step reads (ADR-002).

/**
 * Longest side of a photo, in pixels, before it's measured. Phones save 12–48
 * megapixel photos; the pose model works at 256 px, and above about 20 megapixels
 * MediaPipe runs out of memory. Shrinking to this size gave the same ratio
 * (1.898 at full size and at 2048) and measures about 10× faster (ADR-007).
 */
export const MAX_PHOTO_SIDE = 2048

/** Width and height that fit within MAX_PHOTO_SIDE, keeping the shape. Never enlarges. */
export function fittedSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function drawFitted(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const size = fittedSize(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, size.width, size.height)
  return canvas
}

/** Copies the current video frame, unmirrored, shrunk to MAX_PHOTO_SIDE if larger. */
export function frameToCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  return drawFitted(video, video.videoWidth, video.videoHeight)
}

/** Decodes an image file (respecting its rotation tag), shrunk to MAX_PHOTO_SIDE if larger. Throws if it isn't an image. */
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const canvas = drawFitted(bitmap, bitmap.width, bitmap.height)
  bitmap.close()
  return canvas
}
