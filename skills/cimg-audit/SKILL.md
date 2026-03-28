---
name: cimg-audit
description: >-
  Audits HTML, Vue, Pug, JS, TS, TSX, and JSX image references against intrinsic
  dimensions for CLS risk, aspect-ratio mismatches, and modern-format hints.
  Use when optimizing images, fixing layout shift, LCP heroes, picture/srcset,
  or running lake-cimg scan-code via npx lake-cimg@latest.
---

# cimg image audit

Run **`npx lake-cimg@latest`** from the **project root** (no global install).

<a id="invoke-scan-code"></a>

## Invoke `scan-code`

Use **one** command starting with `npx` — **not** `cd … && npx …` (PowerShell 5.1 on Windows does not support `&&`).

| `path` | Behavior |
| --- | --- |
| *(omitted)* | Scans **`.`** (current working directory). Run from repo root to cover the tree. |
| **Directory** | Recursively scans supported sources under that folder (honors `--no-recursive`). |
| **Single file** | Only that file. Extension must be `.html`, `.htm`, `.vue`, `.pug`, `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, or `.jsx`. |

**Output:** stdout is **only** pretty-printed JSON: `items[]` with `issues`, `hints`, `snippet`, `intrinsicWidth` / `intrinsicHeight` when metadata was read, plus top-level `summary` and scan metadata. **`--issues-only`** drops rows with empty `issues`. For **`missing_dimensions`**, use **`intrinsicWidth` / `intrinsicHeight`** on the same item and/or the English hint that repeats them.

**Examples:**

```bash
npx lake-cimg@latest scan-code
npx lake-cimg@latest scan-code /absolute/path/to/src
npx lake-cimg@latest scan-code /absolute/path/to/about.pug
```

More flags: `npx lake-cimg@latest scan-code --help` (e.g. `--limit`, `--issues-only`, `--no-recursive`). Prefer an **absolute** `path` if the shell cwd may not be the repo root.

## Workflow

- [ ] **1. Scan (read-only):** `npx lake-cimg@latest scan-code [path]` — see **Invoke `scan-code`** above.
- [ ] **2. Triage:** Prefer **`hints`** for what to change; use **`issues`** codes to group or filter. Common codes: `missing_dimensions`, `aspect_ratio_mismatch`, `suggest_modern_format` (default: **single WebP** — point `src` / `srcset` at `.webp` after exporting; use **`<picture>`** with AVIF/WebP + legacy fallback **only if the user explicitly asks** for multi-format markup or old-browser JPEG/PNG fallback), `needs_manual_review`, `missing_src`, `cannot_resolve`, `cannot_read_metadata`.
- [ ] **3. Fix then optimize:** Apply markup using [reference.md](reference.md) (`<img>` first; `<picture>` only when the user requires it). For **all** raster refs that need format or responsive delivery, not only one hero row. Compress / emit WebP: `npx lake-cimg@latest <path> [options]`. **Optional** full stack for `<picture>` when requested: `npx lake-cimg@latest picture <input> -O <outDir>` (details: package [README.md](../../README.md)).

## Rules of thumb

- **Aspect ratio:** Match display ratio to intrinsic (w÷h), or use **`object-fit`** + explicit box / `aspect-ratio` for crop/letterbox.
- **CLS:** Add `width` and `height` to `<img>`, or use CSS `aspect-ratio`. For `missing_dimensions`, fill in the exact `intrinsicWidth` / `intrinsicHeight`.
- **Responsive:** **`srcset` + `sizes`** on `<img>` (works with a single WebP). **`<picture>`** only when the user wants multiple formats in HTML; each `<source type="…">` must match the real file type. Width variants: separate files or `picture … -s <px>` when building a stack.
- **LCP:** At most one hero per view: **`fetchPriority="high"`**, **`loading="eager"`**; lazy-load the rest.
- **Alt:** Describe content and purpose; no keyword stuffing; **`alt=""`** only for decorative images.

## What the scanner cannot resolve

Dynamic **`src`** without a static path → **`needs_manual_review`**. **`http(s):`**, **`data:`**, and path aliases (**`@/`**, **`~/`**, etc.) → **`cannot_resolve`** (no alias map reads; no network fetch).

If **`hints`** mention alias skip: use **`rawRef`** and map the alias via Vite/webpack/tsconfig/Nuxt config. With a **real filesystem path**, run `npx lake-cimg@latest scan <resolved-path>` on assets or re-run **`scan-code`** on markup that uses resolvable relative paths. If unresolved, triage without intrinsic dimensions.

## Other CLI (after scan-code)

| Command | Role |
| --- | --- |
| `npx lake-cimg@latest <path>` | Compress / WebP — see `npx lake-cimg@latest --help` (`-o`, `-s`, `-q`, `-r`). |
| `npx lake-cimg@latest picture <input> -O <outDir>` | One raster → AVIF + WebP + JPEG **when the user wants `<picture>` / multi-format**; not the default if single WebP is enough. |
