/**
 * Shared Sharp pipeline helpers (resize + encode) for compress and picture stack.
 */
import { DEFAULT_EFFORT } from "./constants.js";

const RESIZE_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 0 };

/** AVIF effort 0–9 (higher = slower, often smaller) */
export const DEFAULT_AVIF_EFFORT = 4;

/**
 * Apply "fit inside" square resize when size > 0; otherwise return pipeline unchanged.
 * @param {import("sharp").Sharp} pipeline
 * @param {number | null | undefined} size
 * @returns {import("sharp").Sharp}
 */
export function applyResizeInside(pipeline, size) {
  if (size == null || size <= 0) return pipeline;
  return pipeline.resize({
    width: size,
    height: size,
    fit: "inside",
    withoutEnlargement: true,
    background: RESIZE_BACKGROUND,
  });
}

/**
 * @param {import("sharp").Sharp} pipeline
 * @param {number} quality
 * @param {{ lossless?: boolean }} [options]
 */
export async function encodeWebpBuffer(
  pipeline,
  quality,
  { lossless = false } = {}
) {
  return pipeline
    .webp({
      quality,
      effort: DEFAULT_EFFORT,
      smartSubsample: true,
      lossless,
    })
    .toBuffer();
}

/**
 * @param {import("sharp").Sharp} pipeline
 * @param {number} quality
 */
export async function encodeJpegBuffer(pipeline, quality) {
  return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
}

/**
 * @param {import("sharp").Sharp} pipeline
 * @param {number} quality
 * @param {number} [effort]
 */
export async function encodeAvifBuffer(
  pipeline,
  quality,
  effort = DEFAULT_AVIF_EFFORT
) {
  return pipeline.avif({ quality, effort }).toBuffer();
}
