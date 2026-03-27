/**
 * Core compression logic: collect files, process one, run batch.
 * No process.argv dependency — suitable for programmatic use and tests.
 */
import { readdir, readFile, writeFile, mkdir, stat } from "fs/promises";
import { join, extname, dirname, resolve, basename, relative } from "path";
import { cpus } from "os";
import sharp from "sharp";
import {
  SUPPORTED_EXT,
  DEFAULT_QUALITY,
  DEFAULT_EFFORT,
  supportedFormatsLabel,
} from "./constants.js";

/** Max concurrent tasks for processing images */
const MAX_CONCURRENCY = Math.max(1, cpus().length);

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCompare(before, after) {
  const saved = before - after;
  const pct = before > 0 ? ((saved / before) * 100).toFixed(1) : "0";
  return `${formatSize(before)} → ${formatSize(after)}（节省 ${pct}%）`;
}

/**
 * Run tasks with a maximum concurrency limit.
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} concurrency
 * @returns {Promise<{status: string, value?: any, reason?: any}[]>}
 */
async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      try {
        const val = await tasks[index]();
        results[index] = { status: "fulfilled", value: val };
      } catch (err) {
        results[index] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

function isSupported(filePath) {
  return SUPPORTED_EXT.includes(extname(filePath).toLowerCase());
}

/**
 * Encode pipeline to WebP buffer with shared sharp options.
 * @param {import("sharp").Sharp} pipeline
 * @param {number} quality
 * @param {{ lossless?: boolean }} [options]
 */
async function encodeWebpBuffer(pipeline, quality, { lossless = false } = {}) {
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
 * Recursively collect image paths under dir (or return [dir] if dir is a file).
 * @param {string} inputPath - Absolute path to file or directory
 * @param {boolean} recursive - Whether to recurse into subdirectories
 * @returns {Promise<string[]>} Absolute paths to supported image files
 */
export async function collectFiles(inputPath, recursive = false) {
  const s = await stat(inputPath);
  if (s.isFile()) {
    if (!isSupported(inputPath)) return [];
    return [resolve(inputPath)];
  }
  if (s.isDirectory()) {
    const names = await readdir(inputPath, { withFileTypes: true });
    const promises = names.map(async (ent) => {
      const full = join(inputPath, ent.name);
      if (ent.isDirectory() && recursive) {
        return collectFiles(full, true);
      } else if (ent.isFile() && isSupported(ent.name)) {
        return [resolve(full)];
      }
      return [];
    });
    const subArrays = await Promise.all(promises);
    return subArrays.flat();
  }
  return [];
}

/**
 * Compress one image. Output WebP by default, or keep original format when toWebp is false.
 * @param {string} inputPath - Absolute path to input image
 * @param {{ outDir?: string | null, size?: number | null, quality?: number, toWebp?: boolean }} options
 * @returns {Promise<{
 *   outPath: string,
 *   sizeBefore: number,
 *   sizeAfter: number,
 *   originalWidth: number | null,
 *   originalHeight: number | null,
 *   width: number | null,
 *   height: number | null,
 *   format: string | null
 * }>}
 */
export async function processOne(inputPath, options = {}) {
  const { outDir, size, quality = DEFAULT_QUALITY, toWebp = true } = options;
  const baseDir = dirname(inputPath);
  const extRaw = extname(inputPath);
  const ext = extRaw.toLowerCase();
  const baseName = basename(inputPath, extRaw);
  const outBase = outDir ? resolve(outDir) : baseDir;
  const outExt = toWebp ? ".webp" : ext;
  const outPath = join(outBase, `${baseName}${outExt}`);

  const inputBuffer = await readFile(inputPath);
  const sizeBefore = inputBuffer.length;
  let pipeline = sharp(inputBuffer, { animated: true });
  const inputMeta = await pipeline.metadata();

  if (size != null && size > 0) {
    pipeline = pipeline.resize({
      width: size,
      height: size,
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  const outputBuffer = toWebp
    ? await encodeWebpBuffer(pipeline, quality, { lossless: false })
    : await toFormatBuffer(pipeline, ext, quality);

  const outputMeta = await sharp(outputBuffer).metadata();
  const sizeAfter = outputBuffer.length;
  await mkdir(outBase, { recursive: true });
  await writeFile(outPath, outputBuffer);
  return {
    outPath,
    sizeBefore,
    sizeAfter,
    originalWidth: inputMeta.width ?? null,
    originalHeight: inputMeta.height ?? null,
    width: outputMeta.width ?? null,
    height: outputMeta.height ?? null,
    format: outputMeta.format ?? null,
  };
}

/**
 * Encode to original format (jpeg/png/webp/gif) for --no-webp.
 */
async function toFormatBuffer(pipeline, ext, quality) {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    case ".png":
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case ".webp":
      return encodeWebpBuffer(pipeline, quality);
    case ".gif":
      return pipeline.gif().toBuffer();
    default:
      return encodeWebpBuffer(pipeline, quality);
  }
}

/**
 * Run batch compression.
 * @param {{ inputPath: string, outDir?: string | null, size?: number | null, quality?: number, recursive?: boolean }} options
 * @returns {Promise<{ success: number, failed: number }>} success/failed counts; throws if input invalid
 */
export async function run(options) {
  const {
    inputPath,
    outDir,
    size,
    quality,
    toWebp = true,
    recursive = false,
  } = options;
  const absoluteInput = resolve(inputPath);

  let inputStat;
  try {
    inputStat = await stat(absoluteInput);
  } catch {
    throw new Error(`输入路径不存在: ${absoluteInput}`);
  }
  const baseDir = inputStat.isDirectory() ? absoluteInput : dirname(absoluteInput);

  const files = await collectFiles(absoluteInput, recursive);
  if (files.length === 0) {
    console.log(`未找到支持的图片文件（支持: ${supportedFormatsLabel()}）`);
    return { success: 0, failed: 0 };
  }

  console.log(`\n共 ${files.length} 个文件，开始压缩…\n`);

  const tasks = files.map((fp) => async () => {
    let targetOutDir = outDir;
    if (outDir && recursive) {
      const relPath = relative(baseDir, dirname(fp));
      targetOutDir = join(outDir, relPath);
    }
    return processOne(fp, { outDir: targetOutDir, size, quality, toWebp });
  });

  const results = await runWithConcurrency(tasks, MAX_CONCURRENCY);

  let success = 0;
  let failed = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  for (let i = 0; i < files.length; i++) {
    const r = results[i];
    const fp = files[i];
    if (r.status === "fulfilled") {
      const { outPath, sizeBefore, sizeAfter } = r.value;
      totalBefore += sizeBefore;
      totalAfter += sizeAfter;
      console.log(`  ✅ ${fp} → ${basename(outPath)}`);
      console.log(`     ${formatCompare(sizeBefore, sizeAfter)}`);
      success++;
    } else {
      console.error(`  ❌ ${fp}: ${r.reason?.message ?? r.reason}`);
      failed++;
    }
  }
  console.log(`\n完成：成功 ${success}，失败 ${failed}。`);
  if (success > 0 && totalBefore > 0) {
    console.log(`合计：${formatCompare(totalBefore, totalAfter)}`);
  }
  return { success, failed };
}
