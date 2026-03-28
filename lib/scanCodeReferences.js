/**
 * Scan JS/HTML/Vue/Pug/TS/TSX/JSX for local image references, join sharp metadata,
 * and flag CLS / aspect ratio / modern-format hints (read-only).
 */
import { readdir, readFile, stat } from "fs/promises";
import { extname, join, relative, resolve } from "path";
import sharp from "sharp";
import { SUPPORTED_EXT } from "./constants.js";

const IMG_EXT_PATTERN = String.raw`(?:jpg|jpeg|png|webp|gif)`;
const IMG_EXT_RE = /\.(jpg|jpeg|png|webp|gif)$/i;

const DEFAULT_SOURCE_EXTS = new Set([
  ".html",
  ".htm",
  ".vue",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".pug",
]);

const DEFAULT_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".nuxt",
  ".output",
  ".turbo",
  "vendor",
]);

/** Relative ratio difference threshold (1% = 0.01) */
const DEFAULT_RATIO_TOLERANCE = 0.01;

/**
 * @param {string} text
 * @param {number} index
 */
function lineColAt(text, index) {
  const head = text.slice(0, index);
  const line = head.split("\n").length;
  const lastNl = head.lastIndexOf("\n");
  const column = index - (lastNl === -1 ? 0 : lastNl + 1);
  return { line, column };
}

/**
 * Ranges [start, end) of `<picture>...</picture>` blocks that contain at least one
 * AVIF/WebP `<source>` (MIME type or srcset extension). Non-nested `<picture>` typical case.
 * @param {string} content
 * @returns {Array<{ start: number, end: number }>}
 */
function collectPictureModernIntervals(content) {
  const re = /<picture\b[^>]*>([\s\S]*?)<\/picture>/gi;
  const intervals = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const full = m[0];
    const start = m.index;
    const end = start + full.length;
    const hasModern =
      /type\s*=\s*["']image\/(?:avif|webp)["']/i.test(full) ||
      /\bsrcset\s*=\s*["'][^"']*\.(?:avif|webp)\b/i.test(full);
    if (hasModern) {
      intervals.push({ start, end });
    }
  }
  return intervals;
}

/**
 * @param {number} imgIndex
 * @param {number} imgTagLen
 * @param {Array<{ start: number, end: number }>} intervals
 */
function imgInsidePictureModern(imgIndex, imgTagLen, intervals) {
  const imgEnd = imgIndex + imgTagLen;
  for (const { start, end } of intervals) {
    if (imgIndex >= start && imgEnd <= end) return true;
  }
  return false;
}

/**
 * @param {string} dir
 * @param {Set<string>} excludeDirs
 * @param {Set<string>} sourceExts
 * @param {boolean} recursive
 * @returns {Promise<string[]>}
 */
async function collectSourceFiles(dir, excludeDirs, sourceExts, recursive) {
  const out = [];
  const names = await readdir(dir, { withFileTypes: true });
  for (const ent of names) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!recursive || excludeDirs.has(ent.name)) continue;
      const sub = await collectSourceFiles(
        full,
        excludeDirs,
        sourceExts,
        true
      );
      out.push(...sub);
    } else if (ent.isFile()) {
      const ext = extname(ent.name).toLowerCase();
      if (sourceExts.has(ext)) out.push(resolve(full));
    }
  }
  return out;
}

/**
 * @param {string} style
 * @returns {{ hasAspectRatio: boolean, hasObjectFit: boolean, objectFitValue: string | null }}
 */
function parseStyleHints(style) {
  const lower = style.toLowerCase();
  const hasAspectRatio =
    /aspect-ratio\s*:/i.test(style) || /aspect-ratio\s*:/i.test(lower);
  let objectFitValue = null;
  const ofMatch = style.match(/object-fit\s*:\s*([^;]+)/i);
  if (ofMatch) objectFitValue = ofMatch[1].trim().toLowerCase();
  const hasObjectFit = !!objectFitValue;
  return { hasAspectRatio, hasObjectFit, objectFitValue };
}

/**
 * @param {string} tag
 * @returns {{
 *   srcRaw: string | null,
 *   srcKind: 'static' | 'dynamic' | 'jsx_string' | null,
 *   width: number | null,
 *   height: number | null,
 *   style: string | null,
 * }}
 */
function parseImgTag(tag) {
  let srcRaw = null;
  let srcKind = null;

  const bindSrc = tag.match(/:src\s*=\s*["']([^"']*)["']/i);
  const vbindSrc = tag.match(/v-bind:src\s*=\s*["']([^"']*)["']/i);
  /** Avoid matching `src` inside `:src` — require whitespace or tag start before `src` */
  const plainSrc = tag.match(/(?:^|[\s/])src\s*=\s*["']([^"']*)["']/i);
  const jsxSrc = tag.match(/(?:^|[\s/])src\s*=\s*\{\s*["']([^"']+)["']\s*\}/);

  if (bindSrc || vbindSrc) {
    const val = (bindSrc || vbindSrc)[1];
    if (IMG_EXT_RE.test(val) || val.startsWith("./") || val.startsWith("../") || val.startsWith("/")) {
      srcRaw = val.split("?")[0];
      srcKind = "static";
    } else {
      srcKind = "dynamic";
    }
  } else if (jsxSrc) {
    srcRaw = jsxSrc[1].split("?")[0];
    srcKind = "jsx_string";
  } else if (plainSrc) {
    srcRaw = plainSrc[1].split("?")[0];
    srcKind = "static";
  }

  let width = null;
  let height = null;
  const w1 = tag.match(/\bwidth\s*=\s*["']?(\d+)["']?/i);
  const w2 = tag.match(/\bwidth\s*=\s*\{\s*(\d+)\s*\}/);
  const h1 = tag.match(/\bheight\s*=\s*["']?(\d+)["']?/i);
  const h2 = tag.match(/\bheight\s*=\s*\{\s*(\d+)\s*\}/);
  if (w1 || w2) width = parseInt((w1 || w2)[1], 10);
  if (h1 || h2) height = parseInt((h1 || h2)[1], 10);

  const styleMatch = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  const style = styleMatch ? styleMatch[1] : null;

  return { srcRaw, srcKind, width, height, style };
}

/**
 * Parse Pug `img(src=… width=… height=…)` (one call block).
 * @param {string} block - e.g. `img(src='a.png' width=300 height=100)`
 */
function parsePugImgBlock(block) {
  let srcRaw = null;
  let srcKind = null;
  const srcQuoted = block.match(/\bsrc\s*=\s*["']([^"']*)["']/i);
  const srcUnquoted = block.match(
    /\bsrc\s*=\s*([\w./$-]+\.(?:jpg|jpeg|png|webp|gif))\b/i
  );
  if (srcQuoted) {
    const val = srcQuoted[1].trim();
    if (
      IMG_EXT_RE.test(val) ||
      val.startsWith("./") ||
      val.startsWith("../") ||
      val.startsWith("/")
    ) {
      srcRaw = val.split("?")[0];
      srcKind = "static";
    } else {
      srcKind = "dynamic";
    }
  } else if (srcUnquoted) {
    srcRaw = srcUnquoted[1].split("?")[0];
    srcKind = "static";
  } else if (/\bsrc\s*=/i.test(block)) {
    srcKind = "dynamic";
  }

  const w1 = block.match(/\bwidth\s*=\s*["']?(\d+)["']?/i);
  const h1 = block.match(/\bheight\s*=\s*["']?(\d+)["']?/i);
  const width = w1 ? parseInt(w1[1], 10) : null;
  const height = h1 ? parseInt(h1[1], 10) : null;
  const styleMatch = block.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  const style = styleMatch ? styleMatch[1] : null;

  return { srcRaw, srcKind, width, height, style };
}

/**
 * @param {string} content
 * @returns {Array<{ index: number, line: number, column: number, rawRef: string, kind: string, context: string, parse: object }>}
 */
function extractPugImgRefs(content) {
  /** @type {Array<{ index: number, line: number, column: number, rawRef: string, kind: string, context: string, parse: object }>} */
  const refs = [];
  const re = /\bimg\s*\(/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const startParen = m.index + m[0].length - 1;
    let depth = 1;
    let i = startParen + 1;
    while (i < content.length && depth > 0) {
      const c = content[i];
      if (c === "(") {
        depth++;
        i++;
        continue;
      }
      if (c === ")") {
        depth--;
        i++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        const q = c;
        i++;
        while (i < content.length) {
          if (content[i] === "\\") {
            i += 2;
            continue;
          }
          if (content[i] === q) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }
      i++;
    }
    const block = content.slice(m.index, i);
    const index = m.index;
    const { line, column } = lineColAt(content, index);
    const parsed = parsePugImgBlock(block);

    if (parsed.srcKind === "dynamic") {
      refs.push({
        index,
        line,
        column,
        rawRef: "",
        kind: "img",
        context: block.slice(0, 200),
        parse: { ...parsed, dynamic: true },
      });
      continue;
    }
    if (!parsed.srcRaw) {
      refs.push({
        index,
        line,
        column,
        rawRef: "",
        kind: "img",
        context: block.slice(0, 200),
        parse: { ...parsed, missingSrc: true },
      });
      continue;
    }

    refs.push({
      index,
      line,
      column,
      rawRef: parsed.srcRaw,
      kind: "img",
      context: block.slice(0, 200),
      parse: parsed,
    });
  }
  return refs;
}

/**
 * @param {string} ref
 * @param {string} hostDir
 * @returns {{ status: 'ok', path: string } | { status: 'skip', reason: string }}
 */
function resolveLocalImageRef(ref, hostDir) {
  const trimmed = ref.trim();
  if (!trimmed) return { status: "skip", reason: "empty" };
  if (/^https?:\/\//i.test(trimmed)) {
    return { status: "skip", reason: "remote_url" };
  }
  if (trimmed.startsWith("data:")) {
    return { status: "skip", reason: "data_uri" };
  }
  if (trimmed.startsWith("@/") || trimmed.startsWith("~/") || trimmed.startsWith("~@/")) {
    return { status: "skip", reason: "alias_path" };
  }
  if (!IMG_EXT_RE.test(trimmed)) {
    return { status: "skip", reason: "not_image_extension" };
  }
  const path = resolve(hostDir, trimmed);
  return { status: "ok", path };
}

/**
 * @typedef {{ index: number, line: number, column: number, rawRef: string, kind: string, context: string }} RawRef
 */

/**
 * @param {string} content
 * @param {string} hostDir
 * @param {string} [sourceExt] - lowercase extension e.g. `.pug` to run Pug `img()` extraction
 * @returns {RawRef[]}
 */
function extractFromContent(content, hostDir, sourceExt = "") {
  /** @type {RawRef[]} */
  const refs = [];

  if (sourceExt === ".pug") {
    const pugRefs = extractPugImgRefs(content);
    for (const r of pugRefs) {
      refs.push(r);
    }
  }

  const pictureModernIntervals = collectPictureModernIntervals(content);

  const imgRe = /<img\b[^>]*>/gis;
  let m;
  while ((m = imgRe.exec(content)) !== null) {
    const tag = m[0];
    const index = m.index;
    const { line, column } = lineColAt(content, index);
    const parsed = parseImgTag(tag);
    const pictureHasModernSources = imgInsidePictureModern(
      index,
      tag.length,
      pictureModernIntervals
    );

    if (parsed.srcKind === "dynamic") {
      refs.push({
        index,
        line,
        column,
        rawRef: "",
        kind: "img",
        context: tag.slice(0, 200),
        parse: {
          ...parsed,
          dynamic: true,
          ...(pictureHasModernSources ? { pictureHasModernSources: true } : {}),
        },
      });
      continue;
    }
    if (!parsed.srcRaw) {
      refs.push({
        index,
        line,
        column,
        rawRef: "",
        kind: "img",
        context: tag.slice(0, 200),
        parse: {
          ...parsed,
          missingSrc: true,
          ...(pictureHasModernSources ? { pictureHasModernSources: true } : {}),
        },
      });
      continue;
    }

    refs.push({
      index,
      line,
      column,
      rawRef: parsed.srcRaw,
      kind: "img",
      context: tag.slice(0, 200),
      parse: pictureHasModernSources
        ? { ...parsed, pictureHasModernSources: true }
        : parsed,
    });
  }

  const importRe = new RegExp(
    String.raw`import\s+[^'"]*?\s+from\s+['"]([^'"]+\.${IMG_EXT_PATTERN})['"]`,
    "gi"
  );
  while ((m = importRe.exec(content)) !== null) {
    const index = m.index;
    const { line, column } = lineColAt(content, index);
    refs.push({
      index,
      line,
      column,
      rawRef: m[1],
      kind: "import",
      context: m[0].slice(0, 200),
      parse: null,
    });
  }

  const urlRe = new RegExp(
    String.raw`new\s+URL\s*\(\s*['"]([^'"]+\.${IMG_EXT_PATTERN})['"]\s*,\s*import\.meta\.url\s*\)`,
    "gi"
  );
  while ((m = urlRe.exec(content)) !== null) {
    const index = m.index;
    const { line, column } = lineColAt(content, index);
    refs.push({
      index,
      line,
      column,
      rawRef: m[1],
      kind: "import_meta_url",
      context: m[0].slice(0, 200),
      parse: null,
    });
  }

  const cssUrlRe = new RegExp(
    String.raw`url\s*\(\s*['"]?([^'")]+\.${IMG_EXT_PATTERN})['"]?\s*\)`,
    "gi"
  );
  while ((m = cssUrlRe.exec(content)) !== null) {
    const index = m.index;
    const { line, column } = lineColAt(content, index);
    refs.push({
      index,
      line,
      column,
      rawRef: m[1],
      kind: "css_url",
      context: m[0].slice(0, 200),
      parse: null,
    });
  }

  return refs;
}

/**
 * @param {number} iw
 * @param {number} ih
 * @param {number} dw
 * @param {number} dh
 * @param {number} tol
 */
function ratioMismatch(iw, ih, dw, dh, tol) {
  if (iw <= 0 || ih <= 0 || dw <= 0 || dh <= 0) return false;
  const ri = iw / ih;
  const rd = dw / dh;
  const diff = Math.abs(ri - rd) / Math.max(ri, rd);
  return diff > tol;
}

/**
 * @param {() => Promise<void>} task
 * @param {number} concurrency
 */
async function runPool(tasks, concurrency) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const t = queue.shift();
      if (t) await t();
    }
  });
  await Promise.all(workers);
}

/**
 * @param {string} rootDir 扫描根路径：可为**目录**（递归枚举源码）或**单个源码文件**（仅扫描该文件）。传 `.` 表示当前工作目录。
 * @param {{
 *   recursive?: boolean,
 *   cwd?: string,
 *   sourceExts?: Set<string> | string[],
 *   excludeDirs?: Set<string> | string[],
 *   limit?: number,
 *   issuesOnly?: boolean,
 *   ratioTolerance?: number,
 *   metadataConcurrency?: number,
 * }} [options]
 */
export async function scanCodeReferences(rootDir, options = {}) {
  const {
    recursive = true,
    cwd = process.cwd(),
    limit = 500,
    issuesOnly = false,
    ratioTolerance = DEFAULT_RATIO_TOLERANCE,
    metadataConcurrency = 8,
  } = options;

  const sourceExts =
    options.sourceExts != null
      ? new Set(
          Array.isArray(options.sourceExts)
            ? options.sourceExts.map((e) =>
                e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`
              )
            : [...options.sourceExts]
        )
      : DEFAULT_SOURCE_EXTS;

  const excludeDirs =
    options.excludeDirs != null
      ? new Set(
          Array.isArray(options.excludeDirs)
            ? options.excludeDirs
            : [...options.excludeDirs]
        )
      : DEFAULT_EXCLUDE_DIRS;

  const absoluteRoot = resolve(cwd, rootDir.trim());
  let st;
  try {
    st = await stat(absoluteRoot);
  } catch {
    throw new Error(`路径不存在: ${absoluteRoot}`);
  }
  /** @type {string[]} */
  let sourcePaths;
  if (st.isFile()) {
    const ext = extname(absoluteRoot).toLowerCase();
    if (!sourceExts.has(ext)) {
      const supported = [...sourceExts].sort().join(", ");
      throw new Error(`不支持的源码扩展名: ${ext || "(无)"}（支持: ${supported}）`);
    }
    sourcePaths = [absoluteRoot];
  } else if (st.isDirectory()) {
    sourcePaths = await collectSourceFiles(
      absoluteRoot,
      excludeDirs,
      sourceExts,
      recursive
    );
  } else {
    throw new Error(`不是文件或目录: ${absoluteRoot}`);
  }

  /** @type {Array<{ file: string, absHost: string, ref: RawRef }>} */
  const staged = [];

  for (const absPath of sourcePaths) {
    const hostDir = resolve(absPath, "..");
    let content;
    try {
      content = await readFile(absPath, "utf8");
    } catch {
      continue;
    }
    const relFile = relative(cwd, absPath);
    const displayFile =
      relFile && !relFile.startsWith("..") ? relFile : absPath;
    const sourceExt = extname(absPath).toLowerCase();
    const rawRefs = extractFromContent(content, hostDir, sourceExt);
    for (const ref of rawRefs) {
      staged.push({ file: displayFile, absHost: hostDir, ref });
    }
  }

  /** @type {Map<string, { width: number, height: number, format: string | null, sizeBytes: number } | { error: string }>} */
  const metaCache = new Map();

  const uniquePaths = new Set();
  for (const { absHost, ref } of staged) {
    if (ref.parse?.dynamic || ref.parse?.missingSrc) continue;
    if (!ref.rawRef) continue;
    const res = resolveLocalImageRef(ref.rawRef, absHost);
    if (res.status === "ok") uniquePaths.add(res.path);
  }

  const metaTasks = [...uniquePaths].map((abs) => async () => {
    try {
      const s = await stat(abs);
      if (!s.isFile()) {
        metaCache.set(abs, { error: "not_a_file" });
        return;
      }
      const ext = extname(abs).toLowerCase();
      if (!SUPPORTED_EXT.includes(ext)) {
        metaCache.set(abs, { error: "unsupported_extension" });
        return;
      }
      const buf = await readFile(abs);
      const meta = await sharp(buf, { animated: true }).metadata();
      metaCache.set(abs, {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        format: meta.format ?? null,
        sizeBytes: buf.length,
      });
    } catch (err) {
      metaCache.set(abs, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await runPool(metaTasks, metadataConcurrency);

  /** @type {object[]} */
  const items = [];
  let truncated = false;

  for (const { file, absHost, ref } of staged) {
    if (items.length >= limit) {
      truncated = true;
      break;
    }

    const r = ref;
    const hints = [];
    const issues = [];

    if (r.parse?.dynamic) {
      issues.push("needs_manual_review");
      hints.push("Vue/React/Pug 动态 src 或绑定，需人工确认资源与尺寸");
      items.push({
        file,
        line: r.line,
        column: r.column,
        kind: r.kind,
        rawRef: null,
        resolvedPath: null,
        absolutePath: null,
        intrinsicWidth: null,
        intrinsicHeight: null,
        intrinsicFormat: null,
        issues,
        hints,
        snippet: r.context,
      });
      continue;
    }

    if (r.parse?.missingSrc) {
      issues.push("missing_src");
      hints.push("<img> 未找到可解析的 src");
      items.push({
        file,
        line: r.line,
        column: r.column,
        kind: r.kind,
        rawRef: null,
        resolvedPath: null,
        absolutePath: null,
        intrinsicWidth: null,
        intrinsicHeight: null,
        intrinsicFormat: null,
        issues,
        hints,
        snippet: r.context,
      });
      continue;
    }

    const resolved = resolveLocalImageRef(r.rawRef, absHost);
    if (resolved.status === "skip") {
      const row = {
        file,
        line: r.line,
        column: r.column,
        kind: r.kind,
        rawRef: r.rawRef,
        resolvedPath: null,
        absolutePath: null,
        intrinsicWidth: null,
        intrinsicHeight: null,
        intrinsicFormat: null,
        issues: ["cannot_resolve"],
        hints: [`Skipped: ${resolved.reason}`],
        snippet: r.context,
      };
      if (!issuesOnly || row.issues.length) items.push(row);
      continue;
    }

    const absImage = resolved.path;
    const relResolved = relative(cwd, absImage);
    const displayResolved =
      relResolved && !relResolved.startsWith("..") ? relResolved : absImage;

    const cached = metaCache.get(absImage);
    if (!cached || "error" in cached) {
      const row = {
        file,
        line: r.line,
        column: r.column,
        kind: r.kind,
        rawRef: r.rawRef,
        resolvedPath: displayResolved,
        absolutePath: absImage,
        intrinsicWidth: null,
        intrinsicHeight: null,
        intrinsicFormat: null,
        issues: ["cannot_read_metadata"],
        hints: [
          cached && "error" in cached
            ? String(cached.error)
            : "无法读取图片元数据",
        ],
        snippet: r.context,
      };
      if (!issuesOnly || row.issues.length) items.push(row);
      continue;
    }

    const { width: iw, height: ih, format: fmt, sizeBytes } = cached;
    const ext = extname(absImage).toLowerCase();

    if (r.kind === "img" && r.parse) {
      const p = r.parse;
      const styleHints = p.style ? parseStyleHints(p.style) : { hasAspectRatio: false, hasObjectFit: false, objectFitValue: null };
      const hasBothDims =
        p.width != null &&
        p.height != null &&
        !Number.isNaN(p.width) &&
        !Number.isNaN(p.height);
      const reservesSpace =
        hasBothDims ||
        styleHints.hasAspectRatio ||
        (styleHints.hasObjectFit &&
          (styleHints.objectFitValue === "cover" ||
            styleHints.objectFitValue === "contain" ||
            styleHints.objectFitValue === "fill"));

      if (!reservesSpace && iw > 0 && ih > 0) {
        issues.push("missing_dimensions");
        hints.push(
          `missing_dimensions: set width/height or CSS aspect-ratio for CLS; intrinsicWidth=${iw} intrinsicHeight=${ih}`
        );
      }

      if (
        hasBothDims &&
        iw > 0 &&
        ih > 0 &&
        ratioMismatch(iw, ih, p.width, p.height, ratioTolerance)
      ) {
        const of = styleHints.objectFitValue;
        const skipDistortion =
          of === "cover" || of === "contain" || of === "fill" || of === "scale-down";
        if (!skipDistortion) {
          issues.push("aspect_ratio_mismatch");
          hints.push(
            `声明 ${p.width}×${p.height} 与素材 ${iw}×${ih} 比例不一致；改为匹配比例或使用 object-fit: cover|contain`
          );
        }
      }
    }

    if (
      !(r.kind === "img" && r.parse?.pictureHasModernSources) &&
      (ext === ".jpg" ||
        ext === ".jpeg" ||
        ext === ".png" ||
        ext === ".gif") &&
      fmt
    ) {
      issues.push("suggest_modern_format");
      hints.push("可考虑 WebP/AVIF 或 cimg picture 子命令生成多格式 <picture>");
    }

    const row = {
      file,
      line: r.line,
      column: r.column,
      kind: r.kind,
      rawRef: r.rawRef,
      resolvedPath: displayResolved,
      absolutePath: absImage,
      intrinsicWidth: iw,
      intrinsicHeight: ih,
      intrinsicFormat: fmt,
      sizeBytes,
      issues: [...new Set(issues)],
      hints,
      snippet: r.context,
    };

    if (issuesOnly && row.issues.length === 0) continue;
    items.push(row);
  }

  const withIssues = items.filter((x) => x.issues && x.issues.length > 0);
  const summary = `扫描 ${sourcePaths.length} 个源码文件；抽取引用点 ${staged.length} 个；输出 ${items.length} 条${truncated ? "（已达 limit 截断）" : ""}；含问题 ${withIssues.length} 条`;

  return {
    root: relative(cwd, absoluteRoot) || absoluteRoot,
    absoluteRoot,
    scannedSourceFiles: sourcePaths.length,
    referencePoints: staged.length,
    truncated,
    limit,
    items,
    summary,
  };
}
