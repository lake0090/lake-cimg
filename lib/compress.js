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
  supportedFormatsLabel,
} from "./constants.js";
import {
  applyResizeInside,
  encodeWebpBuffer,
  encodeJpegBuffer,
} from "./sharpHelpers.js";

/** 小于此体积跳过压缩 */
const THRESHOLD_SKIP_FOR_AGENT = 10 * 1024;

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
 *   format: string | null,
 *   skipped?: true,
 *   reason?: "small" | "larger"
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
  if (sizeBefore < THRESHOLD_SKIP_FOR_AGENT) {
    return {
      outPath,
      sizeBefore,
      sizeAfter: sizeBefore,
      originalWidth: null,
      originalHeight: null,
      width: null,
      height: null,
      format: null,
      skipped: true,
      reason: "small",
    };
  }

  let pipeline = sharp(inputBuffer, { animated: true });
  const inputMeta = await pipeline.metadata();

  pipeline = applyResizeInside(pipeline, size);

  const outputBuffer = toWebp
    ? await encodeWebpBuffer(pipeline, quality, { lossless: false })
    : await toFormatBuffer(pipeline, ext, quality);

  const sizeAfter = outputBuffer.length;
  if (sizeAfter > sizeBefore) {
    return {
      outPath,
      sizeBefore,
      sizeAfter,
      originalWidth: inputMeta.width ?? null,
      originalHeight: inputMeta.height ?? null,
      width: null,
      height: null,
      format: null,
      skipped: true,
      reason: "larger",
    };
  }

  const outputMeta = await sharp(outputBuffer).metadata();
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
      return encodeJpegBuffer(pipeline, quality);
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
 * @returns {Promise<{ success: number, failed: number, skipped: number }>} counts; throws if input invalid
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
  let skipped = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  for (let i = 0; i < files.length; i++) {
    const r = results[i];
    const fp = files[i];
    if (r.status === "fulfilled") {
      const v = r.value;
      if (v.skipped) {
        skipped++;
        if (v.reason === "small") {
          console.log(`  ⏭  ${fp}`);
          console.log(
            `     不处理：原图 ${formatSize(v.sizeBefore)} 小于 10KB（无需压缩）`
          );
        } else {
          console.log(`  ⏭  ${fp}`);
          console.log(
            `     不处理：压缩后 ${formatSize(v.sizeAfter)} 大于原图 ${formatSize(v.sizeBefore)}（已保留原图、未写出新文件）`
          );
        }
        continue;
      }
      const { outPath, sizeBefore, sizeAfter } = v;
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
  const skipPart = skipped > 0 ? `，跳过 ${skipped}（<10KB 或压缩后更大）` : "";
  console.log(`\n完成：成功 ${success}，失败 ${failed}${skipPart}。`);
  if (success > 0 && totalBefore > 0) {
    console.log(`合计：${formatCompare(totalBefore, totalAfter)}`);
  }
  return { success, failed, skipped };
}
