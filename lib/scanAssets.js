/**
 * Scan directories for large images using file size only (fast path).
 * Reuses collectFiles + stat; suggestions reference DEFAULT_QUALITY.
 */
import { stat } from "fs/promises";
import { relative, resolve } from "path";
import { collectFiles } from "./compress.js";
import { DEFAULT_QUALITY } from "./constants.js";

const DEFAULT_MIN_BYTES = 512 * 1024;
const DEFAULT_LIMIT = 50;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {number} bytes
 * @param {number} quality
 */
function buildSuggestion(bytes, quality) {
  return `建议转为 WebP（quality 约 ${quality}），或设置 max_side 限制长边；当前 ${formatSize(bytes)}`;
}

/**
 * @param {string} dir - Path relative to cwd or absolute
 * @param {{ recursive?: boolean, minSizeBytes?: number, limit?: number, cwd?: string }} [options]
 */
export async function scanAssets(dir, options = {}) {
  const {
    recursive = true,
    minSizeBytes = DEFAULT_MIN_BYTES,
    limit = DEFAULT_LIMIT,
    cwd = process.cwd(),
  } = options;

  const absoluteDir = resolve(cwd, dir.trim());
  let st;
  try {
    st = await stat(absoluteDir);
  } catch {
    throw new Error(`路径不存在: ${absoluteDir}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`不是目录: ${absoluteDir}`);
  }

  const paths = await collectFiles(absoluteDir, recursive);
  const withStats = await Promise.all(
    paths.map(async (fp) => {
      const s = await stat(fp);
      return { absPath: fp, bytes: s.size };
    })
  );

  const over = withStats.filter((x) => x.bytes >= minSizeBytes);
  over.sort((a, b) => b.bytes - a.bytes);
  const truncated = over.length > limit;
  const slice = over.slice(0, limit);

  const items = slice.map((x) => {
    const rel = relative(cwd, x.absPath);
    const displayPath = rel && !rel.startsWith("..") ? rel : x.absPath;
    return {
      path: displayPath,
      absolutePath: x.absPath,
      bytes: x.bytes,
      sizeHuman: formatSize(x.bytes),
      suggestion: buildSuggestion(x.bytes, DEFAULT_QUALITY),
    };
  });

  let summary =
    `共扫描 ${paths.length} 个支持的图片文件；其中 ${over.length} 个 ≥ ${formatSize(minSizeBytes)}`;
  if (paths.length > 0 && over.length === 0) {
    summary += `。无文件达到阈值，可放宽条件（调低 min_size_kb / min_size_bytes）或确认目录内确有图片`;
  }
  if (truncated) {
    summary += `（仅返回体积最大的前 ${limit} 条，避免撑爆上下文）`;
  }

  return {
    scannedCount: paths.length,
    overThresholdCount: over.length,
    truncated,
    limit,
    minSizeBytes,
    summary,
    items,
  };
}
