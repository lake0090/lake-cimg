/** Supported image extensions for compression */
export const SUPPORTED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

/** Default WebP quality (1–100) */
export const DEFAULT_QUALITY = 75;

/** Sharp WebP effort (0–6), 6 = smallest size */
export const DEFAULT_EFFORT = 6;

/** Human-readable list for messages (e.g. "jpg, jpeg, png, webp, gif") */
export function supportedFormatsLabel() {
  return SUPPORTED_EXT.map((e) => e.slice(1)).join(", ");
}
