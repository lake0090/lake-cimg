/**
 * Scan images for metadata and optimization suggestions (read-only).
 */
import { readFile } from "fs/promises";
import { relative, resolve } from "path";
import sharp from "sharp";
import { collectFiles } from "./compress.js";

const KB = 1024;
const THRESHOLD_LARGE_NON_WEBP = 100 * KB;
const THRESHOLD_LARGE_WEBP = 500 * KB;
const MAX_EDGE = 1920;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {number} sizeBytes
 * @param {string | undefined} format - sharp metadata format (e.g. jpeg, png, webp)
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function computeSuggestion(sizeBytes, format, width, height) {
  const fmt = (format ?? "").toLowerCase();
  if (fmt !== "webp" && sizeBytes > THRESHOLD_LARGE_NON_WEBP) {
    return "convert to webp";
  }
  if (width > MAX_EDGE || height > MAX_EDGE) {
    return "resize to max 1920px";
  }
  if (sizeBytes > THRESHOLD_LARGE_WEBP && fmt === "webp") {
    return "reduce quality";
  }
  return "ok";
}

/**
 * @param {string} inputPath - Absolute path to file or directory
 * @param {{ recursive?: boolean }} [options]
 * @returns {Promise<{ files: Array<{
 *   path: string,
 *   size: string,
 *   sizeBytes: number,
 *   width: number,
 *   height: number,
 *   format: string,
 *   suggestion: string
 * }>, totalBytes: number }>}
 */
export async function scanFiles(inputPath, options = {}) {
  const { recursive = false } = options;
  const absoluteInput = resolve(inputPath);
  const paths = await collectFiles(absoluteInput, recursive);

  const files = [];
  let totalBytes = 0;

  for (const fp of paths) {
    const buf = await readFile(fp);
    const sizeBytes = buf.length;
    totalBytes += sizeBytes;

    let width = 0;
    let height = 0;
    let format = "";
    try {
      const meta = await sharp(buf, { animated: true }).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      format = meta.format ?? "";
    } catch {
      format = "unknown";
    }

    const rel = relative(process.cwd(), fp);
    const displayPath = rel && !rel.startsWith("..") ? rel : fp;

    const suggestion =
      format === "unknown"
        ? "failed to read metadata"
        : computeSuggestion(sizeBytes, format, width, height);

    files.push({
      path: displayPath,
      size: formatSize(sizeBytes),
      sizeBytes,
      width,
      height,
      format,
      suggestion,
    });
  }

  return { files, totalBytes };
}
