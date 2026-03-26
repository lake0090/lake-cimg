#!/usr/bin/env node
/**
 * CLI entry: parse args with Commander, validate, then run lib/compress.run().
 */
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { program } from "commander";
import { run } from "../lib/compress.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
);

/**
 * @param {{ quality: number, size?: number | null }} opts
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateCliOptions(opts) {
  const { quality, size } = opts;
  if (Number.isNaN(quality) || quality < 1 || quality > 100) {
    return { ok: false, message: "错误: --quality 须为 1–100 的整数" };
  }
  if (size != null && (Number.isNaN(size) || size < 1)) {
    return { ok: false, message: "错误: --size 须为正整数" };
  }
  return { ok: true };
}

/** Resolve a user path relative to cwd. */
function resolveUserPath(relativeOrAbsolute) {
  return resolve(process.cwd(), relativeOrAbsolute.trim());
}

program
  .name("cimg")
  .description("批量压缩图片为 WebP，支持单文件或文件夹")
  .version(pkg.version)
  .argument("[input]", "文件或文件夹路径")
  .option("-o, --out-dir <dir>", "输出目录（不指定则直接修改源文件：同目录生成 .webp 后删除原图）")
  .option("-s, --size <px>", "最大边长（可选，不指定则只压缩不缩放）", (v) => parseInt(v, 10))
  .option("-q, --quality <1-100>", "WebP 质量", (v) => parseInt(v, 10), 75)
  .option("--no-webp", "不转为 WebP，保留原格式仅压缩（默认会转为 WebP）")
  .option("-r, --recursive", "递归处理子目录")
  .action(async (input, opts) => {
    if (!input || input.trim() === "") {
      program.outputHelp();
      process.exit(1);
    }
    const validation = validateCliOptions({
      quality: opts.quality,
      size: opts.size,
    });
    if (!validation.ok) {
      console.error(validation.message);
      process.exit(1);
    }
    const inputPath = resolveUserPath(input);
    const outDir = opts.outDir ? resolveUserPath(opts.outDir) : null;
    try {
      const { failed } = await run({
        inputPath,
        outDir,
        size: opts.size ?? null,
        quality: opts.quality,
        toWebp: opts.webp !== false,
        recursive: !!opts.recursive,
      });
      process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
      console.error("错误:", err.message);
      process.exit(1);
    }
  });

program.parse();
