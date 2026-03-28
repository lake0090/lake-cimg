/**
 * One source image → AVIF + WebP + JPEG for <picture> progressive enhancement.
 * Intended for static hero assets (not animated GIF).
 */
import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { dirname, join, resolve, basename, extname } from "path";
import sharp from "sharp";
import { DEFAULT_QUALITY } from "./constants.js";
import {
  applyResizeInside,
  encodeAvifBuffer,
  encodeWebpBuffer,
  encodeJpegBuffer,
} from "./sharpHelpers.js";

/**
 * @param {import("sharp").Sharp} pipeline - Configured pipeline (e.g. after resize)
 * @param {{ quality: number, avifQuality: number, jpegQuality: number }} q
 */
async function encodeTriple(pipeline, q) {
  const [avifBuf, webpBuf, jpegBuf] = await Promise.all([
    encodeAvifBuffer(pipeline.clone(), q.avifQuality),
    encodeWebpBuffer(pipeline.clone(), q.quality),
    encodeJpegBuffer(pipeline.clone(), q.jpegQuality),
  ]);
  return { avifBuf, webpBuf, jpegBuf };
}

/**
 * @param {string} inputPath - Absolute path to one image file
 * @param {{
 *   outDir: string,
 *   size?: number | null,
 *   quality?: number,
 *   avifQuality?: number,
 *   jpegQuality?: number,
 * }} options
 * @returns {Promise<{
 *   baseName: string,
 *   paths: { avif: string, webp: string, jpg: string },
 *   bytes: { before: number, avif: number, webp: number, jpg: number },
 * }>}
 */
export async function processPictureStack(inputPath, options) {
  const {
    outDir,
    size,
    quality = DEFAULT_QUALITY,
    avifQuality = quality,
    jpegQuality = quality,
  } = options;

  const absoluteIn = resolve(inputPath);
  let st;
  try {
    st = await stat(absoluteIn);
  } catch {
    throw new Error(`输入路径不存在: ${absoluteIn}`);
  }
  if (!st.isFile()) {
    throw new Error(`picture 仅支持单个文件，不是目录: ${absoluteIn}`);
  }

  const extRaw = extname(absoluteIn);
  const ext = extRaw.toLowerCase();
  if (ext === ".gif") {
    throw new Error(
      "picture 子命令不支持 GIF 动图；请改用静态 PNG/JPEG/WebP 作为源图"
    );
  }

  const baseName = basename(absoluteIn, extRaw);
  const outBase = resolve(outDir);

  const inputBuffer = await readFile(absoluteIn);
  const sizeBefore = inputBuffer.length;

  let pipeline = applyResizeInside(
    sharp(inputBuffer, { animated: false }),
    size
  );

  const { avifBuf, webpBuf, jpegBuf } = await encodeTriple(pipeline, {
    quality,
    avifQuality,
    jpegQuality,
  });

  await mkdir(outBase, { recursive: true });
  const avifPath = join(outBase, `${baseName}.avif`);
  const webpPath = join(outBase, `${baseName}.webp`);
  const jpgPath = join(outBase, `${baseName}.jpg`);

  await Promise.all([
    writeFile(avifPath, avifBuf),
    writeFile(webpPath, webpBuf),
    writeFile(jpgPath, jpegBuf),
  ]);

  return {
    baseName,
    paths: { avif: avifPath, webp: webpPath, jpg: jpgPath },
    bytes: {
      before: sizeBefore,
      avif: avifBuf.length,
      webp: webpBuf.length,
      jpg: jpegBuf.length,
    },
  };
}

/**
 * URL prefix for snippet (e.g. "" → /hero.avif, "/images" → /images/hero.avif)
 * @param {string} baseName - filename without extension
 * @param {string} urlPrefix - no trailing slash, or empty
 */
export function pictureUrlsForSnippet(baseName, urlPrefix = "") {
  const p = urlPrefix.replace(/\/$/, "");
  const base = p ? `${p}/${baseName}` : `/${baseName}`;
  return {
    avif: `${base}.avif`,
    webp: `${base}.webp`,
    jpg: `${base}.jpg`,
  };
}
