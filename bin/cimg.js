#!/usr/bin/env node
/**
 * CLI entry: parse args with Commander, validate, then run lib/compress.run().
 */
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { program } from "commander";
import { run } from "../lib/compress.js";
import {
  processPictureStack,
  pictureUrlsForSnippet,
} from "../lib/pictureStack.js";
import { scanFiles } from "../lib/scan.js";
import { scanCodeReferences } from "../lib/scanCodeReferences.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
);

/**
 * @param {{ quality: number, size?: number | null }} opts
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateCliOptions(opts) {
  const { quality, size, avifQuality, jpegQuality } = opts;
  if (Number.isNaN(quality) || quality < 1 || quality > 100) {
    return { ok: false, message: "错误: --quality 须为 1–100 的整数" };
  }
  if (size != null && (Number.isNaN(size) || size < 1)) {
    return { ok: false, message: "错误: --size 须为正整数" };
  }
  if (
    avifQuality != null &&
    (Number.isNaN(avifQuality) || avifQuality < 1 || avifQuality > 100)
  ) {
    return { ok: false, message: "错误: --avif-quality 须为 1–100 的整数" };
  }
  if (
    jpegQuality != null &&
    (Number.isNaN(jpegQuality) || jpegQuality < 1 || jpegQuality > 100)
  ) {
    return { ok: false, message: "错误: --jpeg-quality 须为 1–100 的整数" };
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

/** @param {Array<{ path: string, size: string, format: string, width: number, height: number, suggestion: string }>} files */
function printHumanScan(files) {
  if (files.length === 0) {
    console.log("未找到支持的图片文件。");
    return;
  }
  const wPath = 40;
  const wSize = 12;
  const wFmt = 8;
  const wDim = 14;
  console.log(
    `${"路径".padEnd(wPath)} ${"大小".padEnd(wSize)} ${"格式".padEnd(wFmt)} ${"尺寸".padEnd(wDim)} 建议`
  );
  console.log("-".repeat(wPath + wSize + wFmt + wDim + 10));
  for (const f of files) {
    const dim = `${f.width}×${f.height}`;
    const pathCol =
      f.path.length > wPath ? `…${f.path.slice(-(wPath - 1))}` : f.path;
    console.log(
      `${pathCol.padEnd(wPath)} ${f.size.padEnd(wSize)} ${String(f.format).padEnd(wFmt)} ${dim.padEnd(wDim)} ${f.suggestion}`
    );
  }
}

function printPictureSnippet(urls, meta) {
  const { width = 1200, height = 600, alt = "Hero image" } = meta;
  const ar = meta.aspectRatio ?? "16 / 9";
  console.log(`
// 将 url 前缀改成你站点静态资源路径（如 Next.js 放在 public/ 下则用 /images/hero.*）
const images = {
  avif: '${urls.avif}',
  webp: '${urls.webp}',
  jpg: '${urls.jpg}',
};

// React / JSX：srcSet 须驼峰。非首屏大图请改为 loading="lazy" 并去掉 fetchPriority
<picture>
  <source srcSet={images.avif} type="image/avif" />
  <source srcSet={images.webp} type="image/webp" />
  <img
    src={images.jpg}
    width={${width}}
    height={${height}}
    alt="${alt.replace(/"/g, '\\"')}"
    decoding="async"
    fetchPriority="high"
    loading="eager"
    style={{ aspectRatio: '${ar}' }}
  />
</picture>
`);
}

program
  .command("picture <input>")
  .description("从单张源图生成 AVIF + WebP + JPG，供 <picture> 渐进增强")
  .option(
    "-O, --stack-out <dir>",
    "输出目录（必填；使用 -O 避免与主命令 -o 冲突）"
  )
  .option("-s, --size <px>", "最长边上限（可选）", (v) => parseInt(v, 10))
  .option("-q, --quality <1-100>", "WebP 与默认 AVIF/JPEG 质量", (v) => parseInt(v, 10), 75)
  .option("--avif-quality <1-100>", "AVIF 质量（默认同 -q）", (v) => parseInt(v, 10))
  .option("--jpeg-quality <1-100>", "JPEG 质量（默认同 -q）", (v) => parseInt(v, 10))
  .option("--snippet", "生成完成后打印 React + <picture> 示例片段")
  .option(
    "--snippet-prefix <path>",
    "片段里 URL 前缀，如 /images（不要末尾斜杠）",
    ""
  )
  .option("--snippet-width <px>", "示例 img width", (v) => parseInt(v, 10), 1200)
  .option("--snippet-height <px>", "示例 img height", (v) => parseInt(v, 10), 600)
  .option("--snippet-alt <text>", "示例 alt 文案", "Hero image")
  .action(async (input, opts) => {
    if (!input || input.trim() === "") {
      program.outputHelp();
      process.exit(1);
    }
    const validation = validateCliOptions({
      quality: opts.quality,
      size: opts.size,
      avifQuality: opts.avifQuality,
      jpegQuality: opts.jpegQuality,
    });
    if (!validation.ok) {
      console.error(validation.message);
      process.exit(1);
    }
    const inputPath = resolveUserPath(input);
    const stackOut = opts.stackOut;
    if (!stackOut || String(stackOut).trim() === "") {
      console.error("错误: picture 须指定 -O / --stack-out 输出目录");
      process.exit(1);
    }
    const outDir = resolveUserPath(String(stackOut));
    try {
      const result = await processPictureStack(inputPath, {
        outDir,
        size: opts.size ?? null,
        quality: opts.quality,
        avifQuality: opts.avifQuality ?? opts.quality,
        jpegQuality: opts.jpegQuality ?? opts.quality,
      });
      console.log(`✅ ${result.baseName}.avif / .webp / .jpg → ${outDir}`);
      console.log(
        `   体积: 源 ${result.bytes.before} B → avif ${result.bytes.avif} B, webp ${result.bytes.webp} B, jpg ${result.bytes.jpg} B`
      );
      if (opts.snippet) {
        const urls = pictureUrlsForSnippet(
          result.baseName,
          opts.snippetPrefix ?? ""
        );
        printPictureSnippet(urls, {
          width: opts.snippetWidth,
          height: opts.snippetHeight,
          alt: opts.snippetAlt,
        });
      }
      process.exit(0);
    } catch (err) {
      console.error("错误:", err.message);
      process.exit(1);
    }
  });

program
  .command("scan-code <dir>")
  .description(
    "扫描源码中的图片引用（html/vue/pug/js/ts/tsx/jsx），结合像素尺寸给出 CLS / 比例 / 格式建议（只读）"
  )
  .option("-r, --recursive", "递归扫描子目录", true)
  .option("--no-recursive", "不递归子目录")
  .option(
    "--limit <n>",
    "最多输出多少条引用点（默认 500）",
    (v) => parseInt(v, 10),
    500
  )
  .option("--issues-only", "仅输出含 issues 的条目")
  .option("--plain", "纯文本输出（默认 stdout 为 JSON）")
  .action(async (dir, opts) => {
    if (!dir || dir.trim() === "") {
      program.outputHelp();
      process.exit(1);
    }
    const root = resolveUserPath(dir);
    const limit = Number.isNaN(opts.limit) ? 500 : opts.limit;
    try {
      const result = await scanCodeReferences(root, {
        recursive: opts.recursive !== false,
        cwd: process.cwd(),
        limit,
        issuesOnly: !!opts.issuesOnly,
      });
      if (!opts.plain) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.summary);
        for (const it of result.items) {
          console.log(
            `${it.file}:${it.line} ${it.issues?.join(",") || ""} ${it.rawRef || ""} -> ${it.resolvedPath || "-"}`
          );
        }
      }
      process.exit(0);
    } catch (err) {
      console.error("错误:", err.message);
      process.exit(1);
    }
  });

program
  .command("scan [input]")
  .description("扫描图片并给出优化建议（不修改文件）")
  .option("-r, --recursive", "递归处理子目录")
  .option("--json", "以 JSON 格式输出（适合 AI/脚本消费）")
  .action(async function scanAction(input, opts) {
    if (!input || input.trim() === "") {
      this.outputHelp();
      process.exit(1);
    }
    const inputPath = resolveUserPath(input);
    try {
      const { files } = await scanFiles(inputPath, {
        recursive: !!opts.recursive,
      });
      if (opts.json) {
        console.log(JSON.stringify(files, null, 2));
      } else {
        printHumanScan(files);
      }
      process.exit(0);
    } catch (err) {
      console.error("错误:", err.message);
      process.exit(1);
    }
  });

program.parse();
